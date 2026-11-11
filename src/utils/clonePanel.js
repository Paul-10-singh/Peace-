/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Interactive Server Clone Panel & Session Controller
 * Supports interactive selection between:
 *  - Clone Server (Text Channels, Voice Channels, Server Settings, Roles & Permissions)
 *  - Emoji, Stickers & GIFs
 *  - Clone Both (Full Server + Expressions)
 */
const crypto = require('crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js');
const { isBotOwner } = require('./owners');
const { infoEmbed, successEmbed, warningEmbed, errorEmbed, loadingEmbed } = require('./decorations');
const {
  TEXT_LIKE_TYPES,
  VOICE_LIKE_TYPES,
  toArray,
  executeFullClone,
} = require('./serverClone');

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

function sweepSessions(now = Date.now()) {
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function createCloneSession({ userId, sourceGuild, destinationGuild, options = {} }) {
  sweepSessions();
  const id = crypto.randomBytes(4).toString('hex');
  const session = {
    id,
    userId,
    sourceId: sourceGuild.id,
    destId: destinationGuild.id,
    status: 'idle',
    options: {
      textChannels: options.textChannels !== false,
      voiceChannels: options.voiceChannels !== false,
      serverSettings: options.serverSettings !== false,
      rolePermissions: options.rolePermissions !== false,
      wipeExisting: options.wipeExisting !== undefined ? Boolean(options.wipeExisting) : true,
    },
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

function getCloneSession(id) {
  sweepSessions();
  return sessions.get(id) || null;
}

function deleteCloneSession(id) {
  sessions.delete(id);
}

function getGuildOverview(sourceGuild, destinationGuild) {
  const channels = toArray(sourceGuild.channels?.cache).filter(
    (c) => c && (typeof c.isThread !== 'function' || !c.isThread()),
  );
  const categories = channels.filter((c) => c.type === 4).length;
  const text = channels.filter((c) => TEXT_LIKE_TYPES.has(c.type)).length;
  const voice = channels.filter((c) => VOICE_LIKE_TYPES.has(c.type)).length;

  const roles = toArray(sourceGuild.roles?.cache).filter(
    (r) => r && r.id !== sourceGuild.id && r.name !== '@everyone' && !r.managed,
  ).length;

  const emojis = toArray(sourceGuild.emojis?.cache);
  const staticEmojis = emojis.filter((e) => !e.animated).length;
  const animatedGifs = emojis.filter((e) => e.animated).length;
  const stickers = toArray(sourceGuild.stickers?.cache).length;

  const perms = destinationGuild.members?.me?.permissions;
  const isAdmin = Boolean(perms?.has?.(PermissionsBitField.Flags.Administrator));
  const exprPerm =
    PermissionsBitField.Flags.ManageGuildExpressions ??
    PermissionsBitField.Flags.ManageEmojisAndStickers;
  const createExprPerm = PermissionsBitField.Flags.CreateGuildExpressions;

  return {
    source: { categories, text, voice, roles, staticEmojis, animatedGifs, stickers },
    destPerms: {
      isAdmin,
      manageGuild: isAdmin || Boolean(perms?.has?.(PermissionsBitField.Flags.ManageGuild)),
      manageChannels: isAdmin || Boolean(perms?.has?.(PermissionsBitField.Flags.ManageChannels)),
      manageRoles: isAdmin || Boolean(perms?.has?.(PermissionsBitField.Flags.ManageRoles)),
      manageExpressions:
        isAdmin ||
        Boolean((exprPerm && perms?.has?.(exprPerm)) || (createExprPerm && perms?.has?.(createExprPerm))),
    },
  };
}

function validatePermissionsForMode(destGuild, mode, options) {
  const perms = destGuild.members?.me?.permissions;
  if (!perms) return { ok: false, missing: ['Bot member permissions unavailable in destination server'] };
  if (perms.has(PermissionsBitField.Flags.Administrator)) return { ok: true, missing: [] };

  const missing = [];
  if (mode === 'server' || mode === 'both') {
    if (options.serverSettings && !perms.has(PermissionsBitField.Flags.ManageGuild)) {
      missing.push('Manage Server (`ManageGuild`)');
    }
    if ((options.textChannels || options.voiceChannels) && !perms.has(PermissionsBitField.Flags.ManageChannels)) {
      missing.push('Manage Channels (`ManageChannels`)');
    }
    if (options.rolePermissions && !perms.has(PermissionsBitField.Flags.ManageRoles)) {
      missing.push('Manage Roles (`ManageRoles`)');
    }
  }
  if (mode === 'expressions' || mode === 'both') {
    const exprPerm =
      PermissionsBitField.Flags.ManageGuildExpressions ??
      PermissionsBitField.Flags.ManageEmojisAndStickers;
    const createExprPerm = PermissionsBitField.Flags.CreateGuildExpressions;
    const hasExpr =
      (exprPerm && perms.has(exprPerm)) || (createExprPerm && perms.has(createExprPerm));
    if (!hasExpr) {
      missing.push('Create/Manage Expressions (`ManageGuildExpressions` / `CreateGuildExpressions`)');
    }
  }

  return { ok: missing.length === 0, missing };
}

function flagIcon(enabled) {
  return enabled ? '✅' : '❌';
}

function permIcon(granted) {
  return granted ? '🟢' : '🔴';
}

function safeUser(user) {
  return user && typeof user.displayAvatarURL === 'function' ? user : null;
}

function buildClonePanelPayload(session, sourceGuild, destinationGuild, user = null) {
  const info = getGuildOverview(sourceGuild, destinationGuild);
  const { options } = session;

  const embed = infoEmbed({
    title: '🧬 Peace✘ Server Cloner',
    user: safeUser(user),
    thumbnail: sourceGuild.iconURL?.({ size: 256 }) || null,
    description:
      `Select what you want to clone from **${sourceGuild.name}** into **${destinationGuild.name}**.\n\n` +
      `> **Source Server:** **${sourceGuild.name}** (\`${sourceGuild.id}\`)\n` +
      `> **Destination Server:** **${destinationGuild.name}** (\`${destinationGuild.id}\`) · Boost Tier \`${destinationGuild.premiumTier || 0}\``,
    fields: [
      {
        name: '🏛️ Clone Server Preview',
        value:
          `• **Categories:** \`${info.source.categories}\` · **Text:** \`${info.source.text}\` · **Voice:** \`${info.source.voice}\`\n` +
          `• **Roles & Permissions:** \`${info.source.roles}\` custom roles + \`@everyone\` + channel overwrites\n` +
          `• **Server Settings:** Name, Icon, Banner, Verification, Filters, Notifications & AFK/System`,
        inline: false,
      },
      {
        name: '✨ Emoji, Stickers & GIF Preview',
        value:
          `• **Static Emojis:** \`${info.source.staticEmojis}\` · **Animated GIFs:** \`${info.source.animatedGifs}\` · **Stickers:** \`${info.source.stickers}\``,
        inline: false,
      },
      {
        name: '🎛️ Server Clone Options (Toggle Below)',
        value:
          `${flagIcon(options.textChannels)} Text Channels   ` +
          `${flagIcon(options.voiceChannels)} Voice Channels\n` +
          `${flagIcon(options.serverSettings)} Server Settings   ` +
          `${flagIcon(options.rolePermissions)} Roles & Perms\n` +
          `${options.wipeExisting ? '🗑️ **Wipe Destination First:** ON *(replaces existing channels/roles — confirms first)*' : '➕ **Wipe Destination First:** OFF *(keeps existing & appends)*'}`,
        inline: false,
      },
      {
        name: '🔑 Destination Bot Permissions',
        value:
          `${permIcon(info.destPerms.manageGuild)} Manage Server  ` +
          `${permIcon(info.destPerms.manageChannels)} Manage Channels\n` +
          `${permIcon(info.destPerms.manageRoles)} Manage Roles  ` +
          `${permIcon(info.destPerms.manageExpressions)} Manage Expressions`,
        inline: false,
      },
    ],
    extra: 'Bot Owner Only · Session expires in 30m',
  });

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`clone:mode:server:${session.id}`)
      .setLabel('Clone Server')
      .setEmoji('🏛️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`clone:mode:expressions:${session.id}`)
      .setLabel('Emoji, Stickers, GIF')
      .setEmoji('✨')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`clone:mode:both:${session.id}`)
      .setLabel('Clone Both')
      .setEmoji('🚀')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`clone:cancel:${session.id}`)
      .setLabel('Cancel')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger),
  );

  const toggleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`clone:toggle:textChannels:${session.id}`)
      .setLabel('Text Channels')
      .setEmoji('💬')
      .setStyle(options.textChannels ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`clone:toggle:voiceChannels:${session.id}`)
      .setLabel('Voice Channels')
      .setEmoji('🔊')
      .setStyle(options.voiceChannels ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`clone:toggle:serverSettings:${session.id}`)
      .setLabel('Server Settings')
      .setEmoji('⚙️')
      .setStyle(options.serverSettings ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`clone:toggle:rolePermissions:${session.id}`)
      .setLabel('Roles & Perms')
      .setEmoji('🛡️')
      .setStyle(options.rolePermissions ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`clone:toggle:wipeExisting:${session.id}`)
      .setLabel('Wipe Dest')
      .setEmoji('🗑️')
      .setStyle(options.wipeExisting ? ButtonStyle.Danger : ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [actionRow, toggleRow] };
}

function buildWipeConfirmPayload(session, sourceGuild, destinationGuild, mode, user = null) {
  const { options } = session;
  const selectedParts = [];
  if (options.textChannels) selectedParts.push('Text Channels');
  if (options.voiceChannels) selectedParts.push('Voice Channels');
  if (options.serverSettings) selectedParts.push('Server Settings');
  if (options.rolePermissions) selectedParts.push('Roles & Permissions');
  if (mode === 'both') selectedParts.push('Emojis, Animated GIFs & Stickers');

  const embed = warningEmbed({
    title: '⚠️ Confirm Server Clone',
    user: safeUser(user),
    description:
      `You are about to clone **${sourceGuild.name}** (\`${sourceGuild.id}\`) into **${destinationGuild.name}** (\`${destinationGuild.id}\`).\n\n` +
      `**Selected Items:** ${selectedParts.join(', ')}\n\n` +
      `Choose how to handle existing channels & roles in **${destinationGuild.name}**:\n` +
      `• **Wipe & Clone:** Deletes existing channels & deletable roles first for a clean 1:1 copy.\n` +
      `• **Keep Existing & Clone:** Keeps existing channels/roles and adds cloned items alongside them.`,
    extra: 'This action cannot be undone once started',
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`clone:confirm:wipe:${mode}:${session.id}`)
      .setLabel('Wipe & Clone')
      .setEmoji('🚀')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`clone:confirm:keep:${mode}:${session.id}`)
      .setLabel('Keep Existing & Clone')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`clone:back:${session.id}`)
      .setLabel('Back')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

function buildProgressEmbed(sourceGuild, destinationGuild, stage, detail, user = null) {
  return loadingEmbed({
    title: '⏳ Cloning in Progress…',
    user: safeUser(user),
    description:
      `Copying from **${sourceGuild.name}** → **${destinationGuild.name}**\n\n` +
      `> **Current Step:** ${stage}\n` +
      (detail ? `> **Status:** ${detail}` : ''),
    extra: 'Please wait — Discord rate limits are handled automatically',
  });
}

function formatTruncatedList(items, limit = 12) {
  if (!items || !items.length) return '';
  const shown = items.slice(0, limit).map((s) => `• ${s}`).join('\n');
  const rest = items.length > limit ? `\n…and ${items.length - limit} more` : '';
  return (shown + rest).slice(0, 1020);
}

function buildCloneResultEmbed(summary, sourceGuild, destinationGuild, user = null) {
  const fields = [];

  if (summary.settings) {
    const items = summary.settings.updated.length
      ? summary.settings.updated.map((u) => `✅ ${u}`).join(' · ')
      : 'No changes applied';
    fields.push({ name: '⚙️ Server Settings', value: items, inline: false });
  }

  if (summary.roles) {
    fields.push({
      name: '🛡️ Roles & Permissions',
      value:
        `Created: **${summary.roles.createdRoles}** roles · ` +
        `\`@everyone\` synced: **${summary.roles.everyoneUpdated ? 'Yes' : 'No'}**` +
        (summary.roles.deletedRoles ? ` · Removed old: **${summary.roles.deletedRoles}**` : ''),
      inline: false,
    });
  }

  if (summary.channels) {
    fields.push({
      name: '📁 Channels (Text & Voice)',
      value:
        `Categories: **${summary.channels.createdCategories}** · ` +
        `Text Channels: **${summary.channels.createdTextChannels}** · ` +
        `Voice Channels: **${summary.channels.createdVoiceChannels}**` +
        (summary.channels.deletedChannels ? ` · Removed old: **${summary.channels.deletedChannels}**` : ''),
      inline: false,
    });
  }

  if (summary.expressions) {
    fields.push({
      name: '✨ Emoji, Stickers & GIFs',
      value:
        `Static Emojis: **${summary.expressions.copiedStatic}/${summary.expressions.totalStatic}** · ` +
        `Animated GIFs: **${summary.expressions.copiedGifs}/${summary.expressions.totalGifs}** · ` +
        `Stickers: **${summary.expressions.copiedStickers}/${summary.expressions.totalStickers}**`,
      inline: false,
    });
  }

  const converted = summary.channels?.converted || [];
  if (converted.length) {
    fields.push({
      name: '🔄 Adapted Types (Community/News Fallback)',
      value: formatTruncatedList(converted, 8),
      inline: false,
    });
  }

  const allSkipped = [
    ...(summary.settings?.skipped || []),
    ...(summary.roles?.skipped || []),
    ...(summary.channels?.skipped || []),
    ...(summary.expressions?.skipped || []),
  ];
  if (allSkipped.length) {
    fields.push({
      name: `⚠️ Skipped / Notes (${allSkipped.length})`,
      value: formatTruncatedList(allSkipped, 12),
      inline: false,
    });
  }

  const modeLabel =
    summary.mode === 'server'
      ? 'Clone Server'
      : summary.mode === 'expressions'
        ? 'Emoji, Stickers & GIFs'
        : 'Full Clone (Server + Expressions)';

  return successEmbed({
    title: `✅ ${modeLabel} Complete`,
    user: safeUser(user),
    thumbnail: sourceGuild.iconURL?.({ size: 256 }) || null,
    description: `Successfully cloned from **${sourceGuild.name}** (\`${sourceGuild.id}\`) into **${destinationGuild.name}** (\`${destinationGuild.id}\`).`,
    fields,
  });
}

async function runCloneExecution(interaction, session, sourceGuild, destinationGuild, mode) {
  session.status = 'running';
  deleteCloneSession(session.id);

  const runningInDest = interaction.guildId === destinationGuild.id;
  const protectChannelId = runningInDest ? interaction.channelId : null;
  let lastProgressAt = 0;

  const progressEmbed = buildProgressEmbed(
    sourceGuild,
    destinationGuild,
    'Initializing',
    'Preparing clone workflow…',
    interaction.user,
  );

  if (interaction.isButton?.() && !interaction.deferred && !interaction.replied) {
    await interaction.update({ embeds: [progressEmbed], components: [] }).catch(() => {});
  } else if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [progressEmbed], components: [] }).catch(() => {});
  } else {
    await interaction.reply({ embeds: [progressEmbed] }).catch(() => {});
  }

  const onProgress = async ({ stage, detail }) => {
    const now = Date.now();
    if (now - lastProgressAt < 2000) return;
    lastProgressAt = now;
    const embed = buildProgressEmbed(sourceGuild, destinationGuild, stage, detail, interaction.user);
    await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
  };

  try {
    const summary = await executeFullClone({
      sourceGuild,
      destinationGuild,
      mode,
      options: session.options,
      protectChannelId,
      onProgress,
      reason: `Peace✘ /clone all by ${interaction.user.tag}`,
    });

    const resultEmbed = buildCloneResultEmbed(summary, sourceGuild, destinationGuild, interaction.user);

    // If we wiped channels while running inside the destination guild, deliver the
    // final report to the first newly cloned text channel before removing the old one.
    const firstNewText = summary.channels?.firstTextChannel;
    if (
      runningInDest &&
      session.options.wipeExisting &&
      mode !== 'expressions' &&
      firstNewText &&
      firstNewText.id !== interaction.channelId
    ) {
      const sentInNew = await firstNewText
        .send({ content: `<@${interaction.user.id}> Clone finished!`, embeds: [resultEmbed] })
        .catch(() => null);

      if (sentInNew && interaction.channel && typeof interaction.channel.delete === 'function') {
        await interaction.channel.delete('Peace✘ /clone all cleanup after completion').catch(() => {});
        return;
      }
    }

    const edited = await interaction
      .editReply({ embeds: [resultEmbed], components: [] })
      .catch(() => null);
    if (!edited && interaction.channel && typeof interaction.channel.send === 'function') {
      await interaction.channel
        .send({ content: `<@${interaction.user.id}>`, embeds: [resultEmbed] })
        .catch(() => {});
    }
  } catch (err) {
    const errEmbed = errorEmbed({
      title: '❌ Clone Failed',
      user: safeUser(interaction.user),
      description: `An unexpected error occurred during cloning: \`${err.message}\``,
    });
    await interaction.editReply({ embeds: [errEmbed], components: [] }).catch(() => {});
  }
}

async function resolveGuild(client, id) {
  if (!id) return null;
  return client.guilds.cache.get(id) || (await client.guilds.fetch(id).catch(() => null));
}

async function handleClonePanelInteraction(interaction) {
  if (!isBotOwner(interaction.user.id)) {
    return interaction.reply({
      content: '<a:wrong:1550504971303395430> This panel is strictly reserved for the **Bot Owner**.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const parts = interaction.customId.split(':');
  const action = parts[1];
  const sessionId = parts[parts.length - 1];

  const session = getCloneSession(sessionId);
  if (!session) {
    return interaction.reply({
      content: '<a:wrong:1550504971303395430> This clone panel has expired or already finished. Run `/clone all` again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (session.userId !== interaction.user.id) {
    return interaction.reply({
      content: '<a:wrong:1550504971303395430> Only the owner who opened this panel can control it.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (session.status === 'running') {
    return interaction.reply({
      content: '⏳ A clone job is already running on this panel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const sourceGuild = await resolveGuild(interaction.client, session.sourceId);
  const destinationGuild = await resolveGuild(interaction.client, session.destId);
  if (!sourceGuild || !destinationGuild) {
    deleteCloneSession(sessionId);
    return interaction.update({
      embeds: [
        errorEmbed({
          description: 'One of the servers is no longer accessible to the bot.',
          user: safeUser(interaction.user),
        }),
      ],
      components: [],
    }).catch(() => {});
  }

  if (action === 'cancel') {
    deleteCloneSession(sessionId);
    return interaction.update({
      embeds: [
        infoEmbed({
          title: 'Clone Cancelled',
          user: safeUser(interaction.user),
          description: 'Server clone operation was cancelled. No changes were made.',
        }),
      ],
      components: [],
    }).catch(() => {});
  }

  if (action === 'back') {
    const payload = buildClonePanelPayload(session, sourceGuild, destinationGuild, interaction.user);
    return interaction.update(payload).catch(() => {});
  }

  if (action === 'toggle') {
    const key = parts[2];
    if (key in session.options) {
      session.options[key] = !session.options[key];
    }
    const payload = buildClonePanelPayload(session, sourceGuild, destinationGuild, interaction.user);
    return interaction.update(payload).catch(() => {});
  }

  if (action === 'mode') {
    const mode = parts[2];
    if (
      (mode === 'server' || mode === 'both') &&
      !session.options.textChannels &&
      !session.options.voiceChannels &&
      !session.options.serverSettings &&
      !session.options.rolePermissions
    ) {
      return interaction.reply({
        content:
          '<a:wrong:1550504971303395430> Enable at least one **Clone Server** option (Text Channels, Voice Channels, Server Settings, or Roles & Perms).',
        flags: MessageFlags.Ephemeral,
      });
    }

    const permCheck = validatePermissionsForMode(destinationGuild, mode, session.options);
    if (!permCheck.ok) {
      return interaction.reply({
        embeds: [
          errorEmbed({
            title: 'Missing Bot Permissions',
            description:
              `I need the following permission(s) in **${destinationGuild.name}**:\n` +
              permCheck.missing.map((m) => `• ${m}`).join('\n'),
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (mode === 'expressions') {
      return runCloneExecution(interaction, session, sourceGuild, destinationGuild, 'expressions');
    }

    if (session.options.wipeExisting) {
      const confirmPayload = buildWipeConfirmPayload(session, sourceGuild, destinationGuild, mode, interaction.user);
      return interaction.update(confirmPayload).catch(() => {});
    }

    return runCloneExecution(interaction, session, sourceGuild, destinationGuild, mode);
  }

  if (action === 'confirm') {
    const wipeMode = parts[2];
    const mode = parts[3];
    session.options.wipeExisting = wipeMode === 'wipe';

    const permCheck = validatePermissionsForMode(destinationGuild, mode, session.options);
    if (!permCheck.ok) {
      return interaction.reply({
        embeds: [
          errorEmbed({
            title: 'Missing Bot Permissions',
            description:
              `I need the following permission(s) in **${destinationGuild.name}**:\n` +
              permCheck.missing.map((m) => `• ${m}`).join('\n'),
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    return runCloneExecution(interaction, session, sourceGuild, destinationGuild, mode);
  }
}

module.exports = {
  createCloneSession,
  getCloneSession,
  deleteCloneSession,
  getGuildOverview,
  validatePermissionsForMode,
  buildClonePanelPayload,
  buildWipeConfirmPayload,
  buildProgressEmbed,
  buildCloneResultEmbed,
  runCloneExecution,
  handleClonePanelInteraction,
};
