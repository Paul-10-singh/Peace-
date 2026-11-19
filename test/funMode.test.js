import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import p1Command from '../src/commands/music/p1';
import p2Command from '../src/commands/music/p2';
import {
  buildFunModeEmbed,
  buildFunModeButtons,
  handleMusicButton,
  playFunTrack,
} from '../src/music/player';
import { hasFunAccess } from '../src/utils/permissions';
import { PermissionFlagsBits } from 'discord.js';

describe('Fun Mode (/p1, /p2) & Audio Engine Controls', () => {
  const BOT_OWNER_ID = '999000111222333444';
  let originalOwnerId;

  beforeEach(() => {
    originalOwnerId = process.env.OWNER_ID;
    process.env.OWNER_ID = BOT_OWNER_ID;
  });

  afterEach(() => {
    process.env.OWNER_ID = originalOwnerId;
  });

  it('exports valid slash command builders for /p1 and /p2', () => {
    expect(p1Command.data).toBeDefined();
    expect(p1Command.data.name).toBe('p1');
    expect(typeof p1Command.data.description).toBe('string');
    expect(typeof p1Command.execute).toBe('function');

    expect(p2Command.data).toBeDefined();
    expect(p2Command.data.name).toBe('p2');
    expect(typeof p2Command.data.description).toBe('string');
    expect(typeof p2Command.execute).toBe('function');
  });

  describe('Fun Mode Permission Access Control', () => {
    it('allows bot owner access', () => {
      const mockUser = { id: BOT_OWNER_ID };
      const mockGuild = { id: 'guild123', ownerId: 'different_id' };
      expect(hasFunAccess(mockUser, mockGuild)).toBe(true);
    });

    it('allows server owner access', () => {
      const mockUser = { id: 'server_owner_999' };
      const mockGuild = { id: 'guild123', ownerId: 'server_owner_999' };
      expect(hasFunAccess(mockUser, mockGuild)).toBe(true);
    });

    it('allows administrator and manage guild members access', () => {
      const adminMember = {
        id: 'admin_user',
        permissions: {
          has: (perm) => perm === PermissionFlagsBits.Administrator,
        },
      };
      const manageGuildMember = {
        id: 'manager_user',
        permissions: {
          has: (perm) => perm === PermissionFlagsBits.ManageGuild,
        },
      };
      const mockGuild = { id: 'guild123', ownerId: 'other' };

      expect(hasFunAccess(adminMember, mockGuild)).toBe(true);
      expect(hasFunAccess(manageGuildMember, mockGuild)).toBe(true);
    });

    it('denies access to normal members without admin, owner, or whitelist', () => {
      const normalUser = {
        id: 'normal_user_000',
        permissions: {
          has: () => false,
        },
      };
      const mockGuild = { id: 'guild123', ownerId: 'different_owner' };
      expect(hasFunAccess(normalUser, mockGuild)).toBe(false);
    });
  });

  describe('Fun Mode Embed and UI Buttons', () => {
    it('builds the FUN MODE START card embed with correct dark styling and track info', () => {
      const embed = buildFunModeEmbed('Av1');
      expect(embed.data.title).toBe('FUN MODE START');
      expect(embed.data.color).toBe(0x2b2d31);
      expect(embed.data.description).toContain('Av1.mp3');
      expect(embed.data.description).toContain('Extreme Bass Boosted & Noise');
      expect(embed.data.description).toContain('Auto-Loop Enabled');
    });

    it('builds playing state buttons with [Pause] and [✖] buttons', () => {
      const rows = buildFunModeButtons(false);
      expect(rows.length).toBe(1);

      const buttons = rows[0].components;
      expect(buttons.length).toBe(2);

      const pauseBtn = buttons.find((b) => b.data.custom_id === 'music_fun_pause_resume');
      expect(pauseBtn.data.label).toBe('Pause');

      const stopBtn = buttons.find((b) => b.data.custom_id === 'music_fun_stop');
      expect(stopBtn.data.label).toBe('✖');
    });

    it('builds paused state buttons with [Resume] and [✖] buttons', () => {
      const rows = buildFunModeButtons(true);
      const buttons = rows[0].components;

      const resumeBtn = buttons.find((b) => b.data.custom_id === 'music_fun_pause_resume');
      expect(resumeBtn.data.label).toBe('Resume');

      const stopBtn = buttons.find((b) => b.data.custom_id === 'music_fun_stop');
      expect(stopBtn.data.label).toBe('✖');
    });
  });

  describe('Fun Mode Button Control Interactions', () => {
    it('rejects button interaction if member lacks fun access permissions', async () => {
      const replyMock = vi.fn().mockResolvedValue(true);
      const mockInteraction = {
        guildId: 'guild1',
        guild: { id: 'guild1', ownerId: 'owner_1' },
        member: {
          id: 'normal_1',
          permissions: { has: () => false },
          voice: { channel: { id: 'vc1' } },
        },
        user: { id: 'normal_1' },
        customId: 'music_fun_pause_resume',
        reply: replyMock,
      };

      const mockClient = {
        distube: {
          getQueue: vi.fn().mockReturnValue({
            paused: false,
            pause: vi.fn(),
            resume: vi.fn(),
          }),
        },
      };

      // Mock bot in same voice channel
      mockInteraction.guild.members = {
        me: { voice: { channelId: 'vc1' } },
      };

      await handleMusicButton(mockInteraction, mockClient);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('You do not have permission to use Fun Mode controls'),
        })
      );
    });

    it('toggles pause and resume when pressed by authorized member', async () => {
      const updateMock = vi.fn().mockResolvedValue(true);
      const mockQueue = {
        paused: false,
        pause: vi.fn(),
        resume: vi.fn(),
      };

      const mockInteraction = {
        guildId: 'guild1',
        guild: {
          id: 'guild1',
          ownerId: 'owner_1',
          members: { me: { voice: { channelId: 'vc1' } } },
        },
        member: {
          id: 'owner_1',
          permissions: { has: () => true },
          voice: { channel: { id: 'vc1' } },
        },
        user: { id: 'owner_1' },
        customId: 'music_fun_pause_resume',
        update: updateMock,
      };

      const mockClient = {
        distube: {
          getQueue: vi.fn().mockReturnValue(mockQueue),
        },
      };

      // First call pauses
      await handleMusicButton(mockInteraction, mockClient);
      expect(mockQueue.pause).toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalled();

      // Second call resumes
      mockQueue.paused = true;
      await handleMusicButton(mockInteraction, mockClient);
      expect(mockQueue.resume).toHaveBeenCalled();
    });

    it('handles stop without disconnecting voice channel', async () => {
      const updateMock = vi.fn().mockResolvedValue(true);
      const mockQueue = {
        _funMode: true,
        stop: vi.fn(),
      };

      const disconnectMock = vi.fn();
      const mockInteraction = {
        guildId: 'guild1',
        guild: {
          id: 'guild1',
          ownerId: 'owner_1',
          members: {
            me: {
              voice: {
                channelId: 'vc1',
                disconnect: disconnectMock,
              },
            },
          },
        },
        member: {
          id: 'owner_1',
          permissions: { has: () => true },
          voice: { channel: { id: 'vc1' } },
        },
        user: { id: 'owner_1' },
        customId: 'music_fun_stop',
        update: updateMock,
      };

      const mockClient = {
        distube: {
          getQueue: vi.fn().mockReturnValue(mockQueue),
        },
      };

      await handleMusicButton(mockInteraction, mockClient);
      expect(mockQueue.stop).toHaveBeenCalled();
      expect(mockQueue._funMode).toBe(false);
      expect(disconnectMock).not.toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: 'FUN MODE STOPPED',
              }),
            }),
          ]),
          components: [],
        })
      );
    });
  });

  describe('playFunTrack Invocation Flow', () => {
    it('rejects if caller is not in voice channel', async () => {
      const replyMock = vi.fn().mockResolvedValue(true);
      const mockInteraction = {
        guildId: 'guild1',
        guild: { id: 'guild1', ownerId: 'owner_1' },
        member: {
          id: 'owner_1',
          permissions: { has: () => true },
          voice: { channel: null },
        },
        user: { id: 'owner_1' },
        reply: replyMock,
      };

      await playFunTrack(mockInteraction, {}, '1');
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                description: expect.stringContaining('You must be in a voice channel to use `/p1`!'),
              }),
            }),
          ]),
        })
      );
    });

    it('rejects if caller lacks permissions', async () => {
      const replyMock = vi.fn().mockResolvedValue(true);
      const mockInteraction = {
        guildId: 'guild1',
        guild: { id: 'guild1', ownerId: 'server_owner' },
        member: {
          id: 'unauthorized_user',
          permissions: { has: () => false },
          voice: { channel: { id: 'vc1' } },
        },
        user: { id: 'unauthorized_user' },
        reply: replyMock,
      };

      await playFunTrack(mockInteraction, {}, '2');
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('You do not have permission to use Fun Mode commands'),
        })
      );
    });
  });
});
