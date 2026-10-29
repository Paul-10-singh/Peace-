import { describe, it, expect, vi, beforeEach } from 'vitest';
const { normalizeEmoji, buildKey, findBinding, events } = require('../src/events/reactionRoles');
const settings = require('../src/utils/settings');

describe('Reaction Roles Helper & Event Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeEmoji', () => {
    it('normalizes unicode emojis with or without variation selector', () => {
      expect(normalizeEmoji('📢')).toBe('unicode:📢');
      expect(normalizeEmoji('▶️')).toBe('unicode:▶');
      expect(normalizeEmoji('▶')).toBe('unicode:▶');
    });

    it('normalizes custom emojis by id', () => {
      expect(normalizeEmoji('<:valorant:123456789012345678>')).toBe('custom:123456789012345678');
      expect(normalizeEmoji('<a:nature:1552099429362962452>')).toBe('custom:1552099429362962452');
      expect(normalizeEmoji({ id: '123456789012345678', name: 'custom' })).toBe('custom:123456789012345678');
    });
  });

  describe('findBinding', () => {
    it('finds binding by full key and fallback message:emoji', () => {
      const mockList = [
        { key: 'chan1:msg1:unicode:📢', roleId: 'role_announcement' },
        { key: 'chan1:msg1:custom:999999', roleId: 'role_custom' },
      ];
      vi.spyOn(settings, 'get').mockReturnValue(mockList);

      const reactionUnicode = {
        message: { channelId: 'chan1', id: 'msg1' },
        emoji: { name: '📢' },
      };
      expect(findBinding('guild1', reactionUnicode)?.roleId).toBe('role_announcement');

      // Fallback matching when channel differs
      const reactionDifferentChan = {
        message: { channelId: 'chan99', id: 'msg1' },
        emoji: { name: '📢' },
      };
      expect(findBinding('guild1', reactionDifferentChan)?.roleId).toBe('role_announcement');
    });
  });

  describe('messageReactionAdd event', () => {
    it('adds role when binding is found and bot has hierarchy', async () => {
      const addedRoles = [];
      const mockRole = { id: 'role1', name: 'Gamer', position: 5 };
      const mockMember = {
        user: { tag: 'TestUser#0001' },
        roles: {
          cache: new Map(),
          add: vi.fn(async (roleId) => { addedRoles.push(roleId); }),
        },
      };

      const mockMe = {
        roles: { highest: { position: 10, name: 'PeaceX Bot' } },
        permissions: { has: () => true },
      };

      const mockGuild = {
        id: 'guild1',
        name: 'Test Server',
        members: {
          me: mockMe,
          fetch: vi.fn(async () => mockMember),
        },
        roles: {
          cache: new Map([['role1', mockRole]]),
          fetch: vi.fn(async () => mockRole),
        },
      };

      vi.spyOn(settings, 'get').mockReturnValue([
        { key: 'chan1:msg1:unicode:🎮', roleId: 'role1' },
      ]);

      const reaction = {
        message: {
          channelId: 'chan1',
          id: 'msg1',
          guild: mockGuild,
          partial: false,
        },
        emoji: { name: '🎮' },
        partial: false,
      };

      const user = { id: 'user1', bot: false };

      await events.messageReactionAdd({}, reaction, user);
      expect(mockMember.roles.add).toHaveBeenCalledWith('role1', 'Reaction role');
      expect(addedRoles).toContain('role1');
    });

    it('ignores bot users', async () => {
      const reaction = { message: { guild: { id: 'guild1' } } };
      const user = { id: 'bot1', bot: true };
      const getSpy = vi.spyOn(settings, 'get');

      await events.messageReactionAdd({}, reaction, user);
      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  describe('messageReactionRemove event', () => {
    it('removes role when user removes their reaction', async () => {
      const mockRole = { id: 'role1', name: 'Gamer', position: 5 };
      const memberRoles = new Map([['role1', mockRole]]);
      const mockMember = {
        user: { tag: 'TestUser#0001' },
        roles: {
          cache: memberRoles,
          remove: vi.fn(async (roleId) => { memberRoles.delete(roleId); }),
        },
      };

      const mockMe = {
        roles: { highest: { position: 10 } },
        permissions: { has: () => true },
      };

      const mockGuild = {
        id: 'guild1',
        members: {
          me: mockMe,
          fetch: vi.fn(async () => mockMember),
        },
        roles: {
          cache: new Map([['role1', mockRole]]),
          fetch: vi.fn(async () => mockRole),
        },
      };

      vi.spyOn(settings, 'get').mockReturnValue([
        { key: 'chan1:msg1:unicode:🎮', roleId: 'role1' },
      ]);

      const reaction = {
        message: {
          channelId: 'chan1',
          id: 'msg1',
          guild: mockGuild,
          partial: false,
        },
        emoji: { name: '🎮' },
        partial: false,
      };

      const user = { id: 'user1', bot: false };

      await events.messageReactionRemove({}, reaction, user);
      expect(mockMember.roles.remove).toHaveBeenCalledWith('role1', 'Reaction role removed');
    });
  });
});
