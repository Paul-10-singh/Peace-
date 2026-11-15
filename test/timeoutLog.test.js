import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const { buildTimeoutLog } = require('../src/utils/logFormatter');
const {
  scheduleTimeoutExpiry,
  cancelScheduledTimeout,
  hasScheduledTimeout,
  activeTimeouts,
} = require('../src/utils/timeoutTracker');
const guildMemberUpdate = require('../src/events/guildMemberUpdate');

describe('Timeout Moderation Logging System', () => {
  const mockMember = {
    id: 'user_timeout_123',
    user: {
      id: 'user_timeout_123',
      tag: 'GamerGuy#1234',
      username: 'GamerGuy',
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/abc.png',
    },
    guild: {
      id: 'guild_moderation_test',
      fetchAuditLogs: vi.fn(),
    },
  };

  const mockExecutor = {
    id: 'mod_admin_456',
    tag: 'AdminMod#0001',
    username: 'AdminMod',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    activeTimeouts.clear();
  });

  afterEach(() => {
    activeTimeouts.clear();
  });

  describe('buildTimeoutLog', () => {
    it('formats a timeout applied log with executor, reason, and until timestamp', () => {
      const futureUnix = Math.floor(Date.now() / 1000) + 3600;
      const embed = buildTimeoutLog({
        member: mockMember,
        executor: mockExecutor,
        reason: 'Spamming in main chat',
        until: futureUnix * 1000,
        type: 'applied',
      });

      const json = embed.toJSON();
      expect(json.title).toBe('⏳ Member Timed Out');
      expect(json.color).toBe(0xED4245);
      expect(json.description).toContain('Target User :');
      expect(json.description).toContain('<@user_timeout_123>');
      expect(json.description).toContain('Moderator :');
      expect(json.description).toContain('<@mod_admin_456>');
      expect(json.description).toContain('Timeout Until :');
      expect(json.description).toContain('Reason :');
      expect(json.description).toContain('Spamming in main chat');
    });

    it('formats a timeout removed log with executor and green color', () => {
      const embed = buildTimeoutLog({
        member: mockMember,
        executor: mockExecutor,
        reason: 'Appealed on ticket',
        type: 'removed',
      });

      const json = embed.toJSON();
      expect(json.title).toBe('🔓 Member Timeout Removed');
      expect(json.color).toBe(0x57F287);
      expect(json.description).toContain('Moderator :');
      expect(json.description).toContain('<@mod_admin_456>');
      expect(json.description).toContain('Timeout removed before expiration');
      expect(json.description).toContain('Reason :');
    });

    it('formats a timeout naturally expired log with blue color', () => {
      const embed = buildTimeoutLog({
        member: mockMember,
        type: 'expired',
      });

      const json = embed.toJSON();
      expect(json.title).toBe('⏰ Member Timeout Expired');
      expect(json.color).toBe(0x5865F2);
      expect(json.description).toContain('Timeout completed naturally (Auto-Expired)');
    });
  });

  describe('timeoutTracker', () => {
    it('schedules and cancels timeout expiry timers', () => {
      const guildId = 'guild_test_tracker';
      const userId = 'user_track_999';
      const untilTimestamp = Date.now() + 60000;

      scheduleTimeoutExpiry({}, guildId, { id: userId }, untilTimestamp);
      expect(hasScheduledTimeout(guildId, userId)).toBe(true);

      const cancelled = cancelScheduledTimeout(guildId, userId);
      expect(cancelled).toBe(true);
      expect(hasScheduledTimeout(guildId, userId)).toBe(false);
    });
  });

  describe('guildMemberUpdate execution', () => {
    it('detects timeout addition and logs to moderation category', async () => {
      const client = {
        guilds: {
          cache: new Map([
            [
              'guild_moderation_test',
              {
                id: 'guild_moderation_test',
                channels: {
                  cache: new Map([
                    ['mod_channel', { id: 'mod_channel', isTextBased: () => true, send: vi.fn() }],
                  ]),
                },
              },
            ],
          ]),
        },
      };

      const oldMember = {
        ...mockMember,
        communicationDisabledUntilTimestamp: null,
      };

      const futureUntil = Date.now() + 600000;
      const newMember = {
        ...mockMember,
        communicationDisabledUntilTimestamp: futureUntil,
        guild: {
          id: 'guild_moderation_test',
          fetchAuditLogs: vi.fn().mockResolvedValue({
            entries: {
              find: () => ({
                target: { id: mockMember.id },
                executor: mockExecutor,
                reason: 'Toxic behavior',
                createdTimestamp: Date.now(),
                changes: [{ key: 'communication_disabled_until' }],
              }),
            },
          }),
        },
      };

      // Mock logging helper to verify moderation dispatch
      const loggingModule = require('../src/utils/logging');
      const sendLogSpy = vi.spyOn(loggingModule, 'sendLog').mockResolvedValue(true);

      await guildMemberUpdate.execute(client, oldMember, newMember);

      expect(sendLogSpy).toHaveBeenCalledWith(
        client,
        'guild_moderation_test',
        'moderation',
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      );

      sendLogSpy.mockRestore();
    });

    it('detects manual timeout removal and logs to moderation category', async () => {
      const client = { guilds: { cache: new Map() } };
      const oldMember = {
        ...mockMember,
        communicationDisabledUntilTimestamp: Date.now() + 600000,
      };
      const newMember = {
        ...mockMember,
        communicationDisabledUntilTimestamp: null,
        guild: {
          id: 'guild_moderation_test',
          fetchAuditLogs: vi.fn().mockResolvedValue({
            entries: {
              find: () => ({
                target: { id: mockMember.id },
                executor: mockExecutor,
                reason: 'Appeal accepted',
                createdTimestamp: Date.now(),
                changes: [{ key: 'communication_disabled_until', new: null }],
              }),
            },
          }),
        },
      };

      const loggingModule = require('../src/utils/logging');
      const sendLogSpy = vi.spyOn(loggingModule, 'sendLog').mockResolvedValue(true);

      await guildMemberUpdate.execute(client, oldMember, newMember);

      expect(sendLogSpy).toHaveBeenCalledWith(
        client,
        'guild_moderation_test',
        'moderation',
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '🔓 Member Timeout Removed',
              }),
            }),
          ]),
        })
      );

      sendLogSpy.mockRestore();
    });

    it('detects natural timeout expiration when no manual audit log entry is found', async () => {
      const client = { guilds: { cache: new Map() } };
      const oldMember = {
        ...mockMember,
        communicationDisabledUntilTimestamp: Date.now() + 1000,
      };
      const newMember = {
        ...mockMember,
        communicationDisabledUntilTimestamp: null,
        guild: {
          id: 'guild_moderation_test',
          fetchAuditLogs: vi.fn().mockResolvedValue({
            entries: { find: () => null }, // No manual removal entry
          }),
        },
      };

      const loggingModule = require('../src/utils/logging');
      const sendLogSpy = vi.spyOn(loggingModule, 'sendLog').mockResolvedValue(true);

      await guildMemberUpdate.execute(client, oldMember, newMember);

      expect(sendLogSpy).toHaveBeenCalledWith(
        client,
        'guild_moderation_test',
        'moderation',
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '⏰ Member Timeout Expired',
              }),
            }),
          ]),
        })
      );

      sendLogSpy.mockRestore();
    });
  });
});
