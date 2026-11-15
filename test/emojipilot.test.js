import { describe, it, expect, beforeEach } from 'vitest';
const {
  parseEmoji,
  getEmojiPilotConfig,
  setEmojiPilotTarget,
  removeEmojiPilotTarget,
  clearEmojiPilot,
  handleEmojiPilotMessage,
} = require('../src/utils/emojipilot');
const { set } = require('../src/utils/settings');

describe('EmojiPilot System', () => {
  const guildA = `guild_a_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const guildB = `guild_b_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  beforeEach(() => {
    set(guildA, 'emojipilot', { enabled: true, targets: {} });
    set(guildB, 'emojipilot', { enabled: true, targets: {} });
  });

  describe('parseEmoji', () => {
    it('parses standard unicode emojis', () => {
      const res = parseEmoji('🔥');
      expect(res.valid).toBe(true);
      expect(res.reaction).toBe('🔥');
      expect(res.isCustom).toBe(false);

      const heart = parseEmoji('❤️');
      expect(heart.valid).toBe(true);
      expect(heart.reaction).toBe('❤️');
    });

    it('parses static and animated Discord custom emojis', () => {
      const staticRes = parseEmoji('<:pepe_happy:123456789012345678>');
      expect(staticRes.valid).toBe(true);
      expect(staticRes.isCustom).toBe(true);
      expect(staticRes.id).toBe('123456789012345678');
      expect(staticRes.reaction).toBe('123456789012345678');
      expect(staticRes.animated).toBe(false);

      const animRes = parseEmoji('<a:cat_vibe:987654321098765432>');
      expect(animRes.valid).toBe(true);
      expect(animRes.isCustom).toBe(true);
      expect(animRes.id).toBe('987654321098765432');
      expect(animRes.animated).toBe(true);
    });

    it('parses raw emoji ID', () => {
      const rawRes = parseEmoji('123456789012345678');
      expect(rawRes.valid).toBe(true);
      expect(rawRes.isCustom).toBe(true);
      expect(rawRes.reaction).toBe('123456789012345678');
    });

    it('rejects invalid strings and empty inputs', () => {
      expect(parseEmoji('').valid).toBe(false);
      expect(parseEmoji(null).valid).toBe(false);
      expect(parseEmoji('just regular text').valid).toBe(false);
    });
  });

  describe('Target Management & Server Isolation', () => {
    it('sets, retrieves, and updates auto-reaction targets in Guild A', () => {
      const setResult = setEmojiPilotTarget(guildA, 'user_123', '🔥', 'admin_999');
      expect(setResult.success).toBe(true);
      expect(setResult.displayEmoji).toBe('🔥');

      const configA = getEmojiPilotConfig(guildA);
      expect(configA.targets['user_123']).toBeDefined();
      expect(configA.targets['user_123'].emoji).toBe('🔥');

      // Update to new emoji
      setEmojiPilotTarget(guildA, 'user_123', '❤️', 'admin_999');
      const updatedConfig = getEmojiPilotConfig(guildA);
      expect(updatedConfig.targets['user_123'].emoji).toBe('❤️');
    });

    it('enforces strict server isolation (Guild A vs Guild B)', () => {
      setEmojiPilotTarget(guildA, 'user_123', '🔥', 'admin_999');

      const configA = getEmojiPilotConfig(guildA);
      const configB = getEmojiPilotConfig(guildB);

      expect(configA.targets['user_123']).toBeDefined();
      expect(configB.targets['user_123']).toBeUndefined();
    });

    it('removes specific targets and clears all targets', () => {
      setEmojiPilotTarget(guildA, 'user_1', '🔥', 'admin_999');
      setEmojiPilotTarget(guildA, 'user_2', '👑', 'admin_999');

      const removed = removeEmojiPilotTarget(guildA, 'user_1');
      expect(removed).toBe(true);
      expect(getEmojiPilotConfig(guildA).targets['user_1']).toBeUndefined();
      expect(getEmojiPilotConfig(guildA).targets['user_2']).toBeDefined();

      const cleared = clearEmojiPilot(guildA);
      expect(cleared).toBe(1);
      expect(Object.keys(getEmojiPilotConfig(guildA).targets).length).toBe(0);
    });
  });

  describe('handleEmojiPilotMessage auto-reaction execution', () => {
    it('reacts when a targeted user is mentioned', async () => {
      setEmojiPilotTarget(guildA, 'user_target', '🔥', 'admin_1');

      const reactions = [];
      const mockMessage = {
        guild: { id: guildA },
        author: { id: 'user_sender', bot: false },
        mentions: {
          users: new Map([['user_target', { id: 'user_target', username: 'Target' }]]),
        },
        react: async (e) => reactions.push(e),
      };

      await handleEmojiPilotMessage(mockMessage);
      expect(reactions).toContain('🔥');
    });

    it('reacts when someone replies to a targeted user', async () => {
      setEmojiPilotTarget(guildA, 'user_vip', '❤️', 'admin_1');

      const reactions = [];
      const mockMessage = {
        guild: { id: guildA },
        author: { id: 'user_sender', bot: false },
        mentions: {
          users: new Map(),
          repliedUser: { id: 'user_vip' },
        },
        reference: { messageId: 'ref_msg_101' },
        react: async (e) => reactions.push(e),
      };

      await handleEmojiPilotMessage(mockMessage);
      expect(reactions).toContain('❤️');
    });

    it('does NOT react in another guild where the target is not configured', async () => {
      setEmojiPilotTarget(guildA, 'user_target', '🔥', 'admin_1');

      const reactions = [];
      const mockMessageInB = {
        guild: { id: guildB },
        author: { id: 'user_sender', bot: false },
        mentions: {
          users: new Map([['user_target', { id: 'user_target' }]]),
        },
        react: async (e) => reactions.push(e),
      };

      await handleEmojiPilotMessage(mockMessageInB);
      expect(reactions).toHaveLength(0);
    });

    it('does not react to bots or self-mentions', async () => {
      setEmojiPilotTarget(guildA, 'user_target', '🔥', 'admin_1');

      const reactions = [];
      const botMessage = {
        guild: { id: guildA },
        author: { id: 'bot_sender', bot: true },
        mentions: {
          users: new Map([['user_target', { id: 'user_target' }]]),
        },
        react: async (e) => reactions.push(e),
      };
      await handleEmojiPilotMessage(botMessage);
      expect(reactions).toHaveLength(0);

      const selfMentionMessage = {
        guild: { id: guildA },
        author: { id: 'user_target', bot: false },
        mentions: {
          users: new Map([['user_target', { id: 'user_target' }]]),
        },
        react: async (e) => reactions.push(e),
      };
      await handleEmojiPilotMessage(selfMentionMessage);
      expect(reactions).toHaveLength(0);
    });
  });
});
