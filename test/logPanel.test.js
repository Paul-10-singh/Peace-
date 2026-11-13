import { describe, it, expect } from 'vitest';
const {
  LOG_CATEGORIES,
  normalizeName,
  buildPanelPayload,
  autoDetectChannels,
} = require('../src/utils/logPanel');

describe('Log Panel System', () => {
  it('contains all requested categories with default channel names', () => {
    expect(LOG_CATEGORIES.message).toBeDefined();
    expect(LOG_CATEGORIES.message.defaultChannelName).toBe('#🔒〢ᴍᴇꜱꜱᴀɢᴇ_ʟᴏɢꜱ');
    expect(LOG_CATEGORIES.message.events).toContain('Message Deleted');
    expect(LOG_CATEGORIES.message.events).toContain('Message Edited');
    expect(LOG_CATEGORIES.message.events).toContain('Bulk Messages Delete');

    expect(LOG_CATEGORIES.entry).toBeDefined();
    expect(LOG_CATEGORIES.entry.defaultChannelName).toBe('#🔒〢ᴇɴᴛʀʏ_ʟᴏɢꜱ');
    expect(LOG_CATEGORIES.entry.events).toContain('Member Joined');
    expect(LOG_CATEGORIES.entry.events).toContain('Invite Tracker Log');

    expect(LOG_CATEGORIES.exit).toBeDefined();
    expect(LOG_CATEGORIES.exit.defaultChannelName).toBe('#🔒〢ᴇxɪᴛ_ʟᴏɢꜱ');

    expect(LOG_CATEGORIES.role).toBeDefined();
    expect(LOG_CATEGORIES.role.defaultChannelName).toBe('#🔒〢ʀᴏʟᴇ_ʟᴏɢꜱ');

    expect(LOG_CATEGORIES.nickname).toBeDefined();
    expect(LOG_CATEGORIES.nickname.defaultChannelName).toBe('#🔒〢ɴɪᴄᴋɴᴀᴍᴇ_ʟᴏɢꜱ');

    expect(LOG_CATEGORIES.ban).toBeDefined();
    expect(LOG_CATEGORIES.ban.defaultChannelName).toBe('#🔒〢ʙᴀɴ_ᴜɴʙᴀɴ');

    expect(LOG_CATEGORIES.server).toBeDefined();
    expect(LOG_CATEGORIES.server.defaultChannelName).toBe('#🔒〢ꜱᴇʀᴠᴇʀ_ʟᴏɢꜱ');

    expect(LOG_CATEGORIES.vc).toBeDefined();
    expect(LOG_CATEGORIES.vc.defaultChannelName).toBe('#🔒〢ᴠᴄ_ʟᴏɢꜱ');

    expect(LOG_CATEGORIES.webhook).toBeDefined();
    expect(LOG_CATEGORIES.webhook.defaultChannelName).toBe('#🔒〢ᴡᴇʙʜᴏᴏᴋ_ʟᴏɢꜱ');

    expect(LOG_CATEGORIES.automod).toBeDefined();
    expect(LOG_CATEGORIES.automod.defaultChannelName).toBe('#🔒〢ᴍᴏᴅ_ʟᴏɢꜱ');

    expect(LOG_CATEGORIES.channel).toBeDefined();
    expect(LOG_CATEGORIES.emoji).toBeDefined();
    expect(LOG_CATEGORIES.thread).toBeDefined();
    expect(LOG_CATEGORIES.integration).toBeDefined();
    expect(LOG_CATEGORIES.invite).toBeDefined();
    expect(LOG_CATEGORIES.stage).toBeDefined();
  });

  it('normalizes unicode small caps to standard ASCII names', () => {
    expect(normalizeName('🔒〢ᴍᴇꜱꜱᴀɢᴇ_ʟᴏɢꜱ')).toBe('message_logs');
    expect(normalizeName('🔒〢ᴇɴᴛʀʏ_ʟᴏɢꜱ')).toBe('entry_logs');
    expect(normalizeName('🔒〢ᴇxɪᴛ_ʟᴏɢꜱ')).toBe('exit_logs');
    expect(normalizeName('🔒〢ʀᴏʟᴇ_ʟᴏɢꜱ')).toBe('role_logs');
    expect(normalizeName('🔒〢ɴɪᴄᴋɴᴀᴍᴇ_ʟᴏɢꜱ')).toBe('nickname_logs');
    expect(normalizeName('🔒〢ʙᴀɴ_ᴜɴʙᴀɴ')).toBe('ban_unban');
    expect(normalizeName('🔒〢ꜱᴇʀᴠᴇʀ_ʟᴏɢꜱ')).toBe('server_logs');
    expect(normalizeName('🔒〢ᴠᴄ_ʟᴏɢꜱ')).toBe('vc_logs');
    expect(normalizeName('🔒〢ᴡᴇʙʜᴏᴏᴋ_ʟᴏɢꜱ')).toBe('webhook_logs');
    expect(normalizeName('🔒〢ᴍᴏᴅ_ʟᴏɢꜱ')).toBe('mod_logs');
  });

  it('builds panel payload with embed, select menu, channel picker and buttons', () => {
    const mockGuild = {
      id: 'mock_guild_id',
      channels: { cache: new Map() },
    };

    const payload = buildPanelPayload(mockGuild, 'message', false);
    expect(payload.embeds).toBeDefined();
    expect(payload.embeds.length).toBe(1);
    expect(payload.components).toBeDefined();
    expect(payload.components.length).toBe(3);

    // Row 1: StringSelectMenu for Category
    const row1 = payload.components[0].toJSON();
    expect(row1.components[0].custom_id).toBe('log_panel:select_category');

    // Row 2: ChannelSelectMenu
    const row2 = payload.components[1].toJSON();
    expect(row2.components[0].custom_id).toBe('log_panel:set_channel:message');

    // Row 3: Buttons
    const row3 = payload.components[2].toJSON();
    expect(row3.components.some((b) => b.custom_id === 'log_panel:btn_autolink')).toBe(true);
  });

  it('autoDetectChannels matches channels by normalized name pattern', () => {
    const guildId = `mock_detect_guild_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const mockGuild = {
      id: guildId,
      channels: {
        cache: new Map([
          ['ch1', { id: 'ch1', name: '🔒〢ᴍᴇꜱꜱᴀɢᴇ_ʟᴏɢꜱ', type: 0, isTextBased: () => true }],
          ['ch2', { id: 'ch2', name: '🔒〢ᴇɴᴛʀʏ_ʟᴏɢꜱ', type: 0, isTextBased: () => true }],
          ['ch3', { id: 'ch3', name: '🔒〢ᴠᴄ_ʟᴏɢꜱ', type: 0, isTextBased: () => true }],
        ]),
      },
    };

    const result = autoDetectChannels(mockGuild);
    expect(result.matched.length).toBeGreaterThanOrEqual(3);
    expect(result.config.message).toBe('ch1');
    expect(result.config.entry).toBe('ch2');
    expect(result.config.vc).toBe('ch3');
  });

  it('strictly ignores voice channels when detecting log channels', () => {
    const guildId = `mock_vc_guild_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const mockGuild = {
      id: guildId,
      channels: {
        cache: new Map([
          ['vc1', { id: 'vc1', name: 'General Vc', type: 2, isTextBased: () => true, isVoiceBased: () => true }],
          ['vc2', { id: 'vc2', name: '🔒〢ᴠᴄ_ʟᴏɢꜱ', type: 0, isTextBased: () => true, isVoiceBased: () => false }],
        ]),
      },
    };

    const result = autoDetectChannels(mockGuild);
    expect(result.config.vc).toBe('vc2');
    expect(result.config.vc).not.toBe('vc1');
  });
});
