/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Interactive Logging Configuration Panel
 * Full coverage of all 13 Discord event categories & 60+ audit events.
 */
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const { get, set } = require('./settings');
const { isOwner } = require('./owners');

// Mapping of unicode small-caps letters to standard ASCII
const SMALL_CAPS_MAP = {
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g',
  'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n',
  'ᴏ': 'o', 'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v',
  'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
};

function normalizeName(name = '') {
  return name
    .toLowerCase()
    .split('')
    .map((c) => SMALL_CAPS_MAP[c] || c)
    .join('')
    .replace(/[^a-z0-9_]/g, '');
}

const LOG_CATEGORIES = {
  message: {
    key: 'message',
    name: 'Message Events',
    emoji: '💬',
    defaultChannelName: '#🔒〢ᴍᴇꜱꜱᴀɢᴇ_ʟᴏɢꜱ',
    searchKeywords: ['message_logs', 'messagelogs', 'message'],
    events: [
      'Message Deleted',
      'Message Edited',
      'Bulk Messages Delete',
      'Message Pinned',
      'Message Unpinned',
    ],
  },
  entry: {
    key: 'entry',
    name: 'Member Events (Entry)',
    emoji: '📥',
    defaultChannelName: '#🔒〢ᴇɴᴛʀʏ_ʟᴏɢꜱ',
    searchKeywords: ['entry_logs', 'entrylogs', 'entry', 'join'],
    events: ['Member Joined', 'Invite Tracker Log'],
  },
  exit: {
    key: 'exit',
    name: 'Member Events (Exit)',
    emoji: '📤',
    defaultChannelName: '#🔒〢ᴇxɪᴛ_ʟᴏɢꜱ',
    searchKeywords: ['exit_logs', 'exitlogs', 'exit', 'leave'],
    events: ['Member Left'],
  },
  role: {
    key: 'role',
    name: 'Role Events',
    emoji: '🏷️',
    defaultChannelName: '#🔒〢ʀᴏʟᴇ_ʟᴏɢꜱ',
    searchKeywords: ['role_logs', 'rolelogs', 'role'],
    events: [
      'Role Given',
      'Role Removed',
      'Role Created',
      'Role Deleted',
      'Role Updated',
      'Roles Reordered',
    ],
  },
  nickname: {
    key: 'nickname',
    name: 'Nickname Events',
    emoji: '📛',
    defaultChannelName: '#🔒〢ɴɪᴄᴋɴᴀᴍᴇ_ʟᴏɢꜱ',
    searchKeywords: ['nickname_logs', 'nicknamelogs', 'nickname', 'nick'],
    events: ['Nicknamed Changed'],
  },
  ban: {
    key: 'ban',
    name: 'Ban & Moderation Events',
    emoji: '🔨',
    defaultChannelName: '#🔒〢ʙᴀɴ_ᴜɴʙᴀɴ',
    searchKeywords: ['ban_unban', 'banunban', 'ban', 'mod_logs'],
    events: [
      'Member Banned',
      'Member Unbanned',
      'Member Kicked',
      'Members Pruned',
      'Timeouts',
    ],
  },
  server: {
    key: 'server',
    name: 'Server Events',
    emoji: '🏛️',
    defaultChannelName: '#🔒〢ꜱᴇʀᴠᴇʀ_ʟᴏɢꜱ',
    searchKeywords: ['server_logs', 'serverlogs', 'server'],
    events: [
      'Server Updated',
      'App Added',
      'Server Event Created',
      'Server Event Updated',
      'Server Event Deleted',
      'Application Command Permission Updated',
    ],
  },
  channel: {
    key: 'channel',
    name: 'Channel Events',
    emoji: '📁',
    defaultChannelName: 'Select Channel',
    searchKeywords: ['channel_logs', 'channellogs', 'channel'],
    events: [
      'Channel Created',
      'Channel Deleted',
      'Channel Updated',
      'Channel Permission Created',
      'Channel Permission Updated',
      'Channel Permission Deleted',
    ],
  },
  emoji: {
    key: 'emoji',
    name: 'Emoji & Stickers Events',
    emoji: '✨',
    defaultChannelName: 'Select Channel',
    searchKeywords: ['emoji_logs', 'emojilogs', 'emoji', 'sticker'],
    events: [
      'Emoji Created',
      'Emoji Deleted',
      'Emoji Updated',
      'Sticker Created',
      'Sticker Deleted',
      'Sticker Updated',
    ],
  },
  vc: {
    key: 'vc',
    name: 'Voice Events',
    emoji: '🎙️',
    defaultChannelName: '#🔒〢ᴠᴄ_ʟᴏɢꜱ',
    searchKeywords: ['vc_logs', 'vclogs', 'vc', 'voice'],
    events: [
      'Voice Channel Joined',
      'Voice Channel Left',
      'Voice Channel Changed',
      'Voice Disconnected',
      'Voice Member Muted',
      'Voice Member Deafened',
    ],
  },
  thread: {
    key: 'thread',
    name: 'Thread Events',
    emoji: '🧵',
    defaultChannelName: 'Select Channel',
    searchKeywords: ['thread_logs', 'threadlogs', 'thread'],
    events: ['Thread Created', 'Thread Deleted', 'Thread Updated'],
  },
  webhook: {
    key: 'webhook',
    name: 'Webhook Events',
    emoji: '🪝',
    defaultChannelName: '#🔒〢ᴡᴇʙʜᴏᴏᴋ_ʟᴏɢꜱ',
    searchKeywords: ['webhook_logs', 'webhooklogs', 'webhook'],
    events: ['Webhook Created', 'Webhook Updated', 'Webhook Deleted'],
  },
  integration: {
    key: 'integration',
    name: 'Integration Events',
    emoji: '🔌',
    defaultChannelName: 'Select Channel',
    searchKeywords: ['integration_logs', 'integrationlogs', 'integration'],
    events: ['Integration Created', 'Integration Updated', 'Integration Deleted'],
  },
  invite: {
    key: 'invite',
    name: 'Invite Events',
    emoji: '🔗',
    defaultChannelName: 'Select Channel',
    searchKeywords: ['invite_logs', 'invitelogs', 'invite'],
    events: ['Invite Created', 'Invite Updated', 'Invite Deleted'],
  },
  stage: {
    key: 'stage',
    name: 'Stage Events',
    emoji: '🎭',
    defaultChannelName: 'Select Channel',
    searchKeywords: ['stage_logs', 'stagelogs', 'stage'],
    events: ['Stage Created', 'Stage Updated', 'Stage Deleted'],
  },
  automod: {
    key: 'automod',
    name: 'AutoMod Events',
    emoji: '🛡️',
    defaultChannelName: '#🔒〢ᴍᴏᴅ_ʟᴏɢꜱ',
    searchKeywords: ['mod_logs', 'modlogs', 'automod', 'automod_logs'],
    events: [
      'AutoMod Rule Created',
      'AutoMod Rule Deleted',
      'AutoMod Rule Updated',
      'AutoMod Block Message',
      'AutoMod Flag Message',
      'AutoMod User Timeout',
    ],
  },
};

/**
 * Builds the interactive log configuration panel payload.
 */
function buildPanelPayload(guild, activeCategoryKey = 'message', showOverview = false) {
  const config = get(guild.id, 'logs') || {};
  const currentCategory = LOG_CATEGORIES[activeCategoryKey] || LOG_CATEGORIES.message;

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('📋 Server Audit & Event Logging Panel')
    .setFooter({ text: 'Peace✘ Logging Dashboard • Select a category or auto-link channels' })
    .setTimestamp();

  if (showOverview) {
    let desc = '### 📊 All Log Channels Overview\n\n';
    for (const [key, cat] of Object.entries(LOG_CATEGORIES)) {
      const channelId = config[key];
      const channelMention = channelId ? `<#${channelId}>` : `\`${cat.defaultChannelName}\``;
      desc += `${cat.emoji} **${cat.name}** ➜ ${channelMention}\n`;
    }
    embed.setDescription(desc);
  } else {
    const currentChannelId = config[currentCategory.key];
    const statusText = currentChannelId
      ? `🟢 Active: <#${currentChannelId}>`
      : `⚪ Unset (Default: \`${currentCategory.defaultChannelName}\`)`;

    const eventsList = currentCategory.events.map((e) => `• ${e}`).join('\n');

    embed.setDescription(
      `### ${currentCategory.emoji} ${currentCategory.name}\n` +
      `**Channel:** ${statusText}\n\n` +
      `**Tracked Events:**\n${eventsList}\n\n` +
      `*Use the channel picker below to assign a channel, or choose another category from the dropdown.*`
    );
  }

  // Row 1: Category selection menu
  const categoryOptions = Object.values(LOG_CATEGORIES).map((cat) => ({
    label: cat.name,
    value: cat.key,
    description: `${cat.events.length} events • ${config[cat.key] ? 'Configured' : cat.defaultChannelName}`,
    emoji: cat.emoji,
    default: cat.key === activeCategoryKey,
  }));

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('log_panel:select_category')
      .setPlaceholder(`Category: ${currentCategory.name}`)
      .addOptions(categoryOptions)
  );

  // Row 2: Channel picker for active category
  const channelPickerRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`log_panel:set_channel:${currentCategory.key}`)
      .setPlaceholder(`Pick channel for ${currentCategory.name}...`)
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

  // Row 3: Action Buttons
  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('log_panel:btn_autolink')
      .setLabel('⚡ Auto-Link Channels')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`log_panel:btn_unset:${currentCategory.key}`)
      .setLabel('🗑️ Unset Channel')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!config[currentCategory.key]),
    new ButtonBuilder()
      .setCustomId(showOverview ? `log_panel:btn_details:${currentCategory.key}` : 'log_panel:btn_overview')
      .setLabel(showOverview ? '📁 Show Details' : '📊 Full Overview')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [selectRow, channelPickerRow, buttonsRow],
  };
}

/**
 * Automatically scans server channels and matches them to log categories.
 */
function autoDetectChannels(guild) {
  const config = get(guild.id, 'logs') || {};
  const channels = [...(guild.channels?.cache?.values() || [])].filter((c) => c.isTextBased?.() || c.type === 0);
  const matched = [];

  for (const [key, cat] of Object.entries(LOG_CATEGORIES)) {
    // If already configured and still valid, keep it
    if (config[key] && guild.channels?.cache?.has(config[key])) continue;

    // Search for matching channel by normalized name
    const found = channels.find((c) => {
      const norm = normalizeName(c.name);
      return cat.searchKeywords.some((kw) => norm.includes(kw));
    });

    if (found) {
      config[key] = found.id;
      matched.push({ category: cat.name, channel: found.name, id: found.id });
    }
  }

  if (matched.length > 0) {
    set(guild.id, 'logs', config);
  }

  return { matched, config };
}

/**
 * Handles all interactions originating from the log setup panel.
 */
async function handleLogPanelInteraction(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  // Permission check
  const member = interaction.member;
  const hasAccess =
    isOwner(interaction.user.id, guild.id, guild) ||
    member?.permissions?.has('ManageGuild') ||
    member?.permissions?.has('Administrator');

  if (!hasAccess) {
    return interaction.reply({
      content: '❌ Only administrators or server owners can configure server logs.',
      ephemeral: true,
    });
  }

  const customId = interaction.customId;

  // 1. Category dropdown selection
  if (interaction.isStringSelectMenu() && customId === 'log_panel:select_category') {
    const selectedKey = interaction.values[0];
    const payload = buildPanelPayload(guild, selectedKey, false);
    return interaction.update(payload).catch(() => {});
  }

  // 2. Channel picker selection
  if (interaction.isChannelSelectMenu() && customId.startsWith('log_panel:set_channel:')) {
    const categoryKey = customId.split(':')[2];
    const selectedChannelId = interaction.values[0];

    const config = get(guild.id, 'logs') || {};
    config[categoryKey] = selectedChannelId;

    // Keep backwards compatibility keys updated
    if (categoryKey === 'ban') config.moderation = selectedChannelId;
    if (categoryKey === 'entry') config.welcome = selectedChannelId;
    if (categoryKey === 'exit') config.goodbye = selectedChannelId;
    if (categoryKey === 'server') config.utility = selectedChannelId;

    set(guild.id, 'logs', config);

    const payload = buildPanelPayload(guild, categoryKey, false);
    return interaction.update(payload).catch(() => {});
  }

  // 3. Button presses
  if (interaction.isButton()) {
    if (customId === 'log_panel:btn_autolink') {
      const { matched } = autoDetectChannels(guild);
      const payload = buildPanelPayload(guild, 'message', true);

      let replyNote = '';
      if (matched.length > 0) {
        replyNote = `✅ Automatically linked ${matched.length} channel(s):\n` +
          matched.map((m) => `• ${m.category} ➜ <#${m.id}>`).join('\n');
      } else {
        replyNote = 'ℹ️ No new matching log channels found in the server. You can pick channels manually using the dropdowns.';
      }

      await interaction.update(payload).catch(() => {});
      return interaction.followUp({ content: replyNote, ephemeral: true }).catch(() => {});
    }

    if (customId.startsWith('log_panel:btn_unset:')) {
      const categoryKey = customId.split(':')[2];
      const config = get(guild.id, 'logs') || {};
      delete config[categoryKey];
      set(guild.id, 'logs', config);

      const payload = buildPanelPayload(guild, categoryKey, false);
      return interaction.update(payload).catch(() => {});
    }

    if (customId === 'log_panel:btn_overview') {
      const payload = buildPanelPayload(guild, 'message', true);
      return interaction.update(payload).catch(() => {});
    }

    if (customId.startsWith('log_panel:btn_details:')) {
      const categoryKey = customId.split(':')[2] || 'message';
      const payload = buildPanelPayload(guild, categoryKey, false);
      return interaction.update(payload).catch(() => {});
    }
  }
}

module.exports = {
  LOG_CATEGORIES,
  normalizeName,
  buildPanelPayload,
  autoDetectChannels,
  handleLogPanelInteraction,
};
