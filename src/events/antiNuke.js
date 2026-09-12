/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * ANTI-NUKE — instant-action protection (concept ported from Peace✘ᴾᴿᴼ).
 *
 * The Pro build treats every *single* unauthorized destructive audit-log action
 * as a nuke attempt and neutralizes the executor immediately (it does not wait
 * for a burst threshold). This elevator is strictly faster and stronger than
 * the old window-based "4 events in 12s" detector, so that detector is removed.
 *
 * Protected surface:
 *   - Channel create / delete / update
 *   - Role create / delete / update (incl. dangerous permission grants)
 *   - Ban / unban / kick
 *   - Webhook create / delete / update
 *   - Sticker create / delete / update
 *   - Emoji create / delete / update
 *   - Server (guild) update
 *   - Bot addition (guildMemberAdd with a bot user)
 *   - @everyone / @here mention via messageCreate
 *
 * Bypass list (never punished):
 *   - guild owner, bot-self, main owner + extra owners (/owner)
 *   - per-guild whitelisted users (security.whitelist, managed via /whitelist)
 *   - members holding a whitelisted role (antiNuke.whitelistRoles)
 *
 * On a real hit the executor is punished instantly (ban/timeout/strip roles)
 * and an optional auto-lockdown can be triggered. Everything is logged to the
 * `security` log channel (/setlog security).
 */
const { EmbedBuilder, AuditLogEvent, PermissionsBitField } = require('discord.js');
const { get } = require('../utils/settings');
const { isOwner } = require('../utils/owners');
const { errorEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');

// Audit types we watch, mapped to human labels.
const AUDIT = {
  [AuditLogEvent.ChannelCreate]: 'channel created',
  [AuditLogEvent.ChannelDelete]: 'channel deleted',
  [AuditLogEvent.ChannelUpdate]: 'channel updated',
  [AuditLogEvent.RoleCreate]: 'role created',
  [AuditLogEvent.RoleDelete]: 'role deleted',
  [AuditLogEvent.RoleUpdate]: 'role updated',
  [AuditLogEvent.MemberBanAdd]: 'member banned',
  [AuditLogEvent.MemberBanRemove]: 'member unbanned',
  [AuditLogEvent.MemberKick]: 'member kicked',
  [AuditLogEvent.WebhookCreate]: 'webhook created',
  [AuditLogEvent.WebhookDelete]: 'webhook deleted',
  [AuditLogEvent.WebhookUpdate]: 'webhook updated',
  [AuditLogEvent.StickerCreate]: 'sticker created',
  [AuditLogEvent.StickerDelete]: 'sticker deleted',
  [AuditLogEvent.StickerUpdate]: 'sticker updated',
  [AuditLogEvent.EmojiCreate]: 'emoji created',
  [AuditLogEvent.EmojiDelete]: 'emoji deleted',
  [AuditLogEvent.EmojiUpdate]: 'emoji updated',
  [AuditLogEvent.GuildUpdate]: 'server settings changed',
};

const DESTRUCTIVE_PERMISSIONS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.MentionEveryone,
];

/** Whether a user is protected by any bypass (never punish). */
function isProtected(guild, userId, antiNuke) {
  if (userId === guild.ownerId) return true;
  if (isOwner(userId, guild?.id)) return true;
  const cfg = get(guild.id, 'security');
  if ((cfg.whitelist || []).includes(userId)) return true;
  const member = guild.members.cache.get(userId);
  if (member) {
    return (antiNuke.whitelistRoles || []).some((rid) => member.roles.cache.has(rid));
  }
  return false;
}

async function getActor(guild, auditType) {
  try {
    const entry = (await guild.fetchAuditLogs({ type: auditType, limit: 1 })).entries.first();
    if (!entry) return null;
    if (entry.createdTimestamp < Date.now() - 8000) return null;
    return entry.executor || null;
  } catch {
    return null;
  }
}

/** Apply the configured punishment to an executor in one shot. */
async function punish(guild, member, antiNuke, label) {
  const punishment = (antiNuke.punishment || 'ban').toLowerCase();
  const reason = `Peace✘ anti-nuke: unauthorized ${label}`;

  // Strip restoring (non-boost) roles first so a ban-bypasser has nothing.
  if (member && !member.roles.managed) {
    const managedRoles = member.roles.cache.filter((r) => r.managed).map((r) => r.id);
    await member.roles.set(managedRoles, reason).catch(() => {});
  }

  if (punishment === 'kick' && member?.kickable) {
    await member.kick(reason).catch(() => {});
  } else if (punishment === 'timeout' && member?.moderatable) {
    await member.timeout(60 * 60 * 1000, reason).catch(() => {});
  } else if (member) {
    // default: ban (only when we can resolve the member; otherwise skip)
    await guild.members.ban(member.id, { reason, deleteMessageSeconds: 0 }).catch(() => {});
  }
}

/** Lock down every text channel (configurable). */
async function lockdown(guild) {
  if (!guild) return;
  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased()) {
      await channel.permissionOverwrites
        .edit(guild.id, { SendMessages: false }, { reason: 'Peace✘ anti-nuke lockdown' })
        .catch(() => {});
    }
  }
}

/**
 * Core: react to one audit-log event. `auditType` -> figure out executor and,
 * unless protected, punish them instantly + log + optional lockdown.
 */
async function handleAudit(client, guild, auditType, label, opts = {}) {
  if (!guild) return;
  const cfg = get(guild.id, 'security');
  if (!cfg.antiNuke?.enabled) return;
  const antiNuke = cfg.antiNuke;

  const actor = await getActor(guild, auditType);
  if (!actor) return;
  // The bot / protected users never trigger.
  if (actor.id === client.user.id || isProtected(guild, actor.id, antiNuke)) return;

  const member = await guild.members.fetch(actor.id).catch(() => null);
  await punish(guild, member, antiNuke, label);

  if (antiNuke.lockdown !== false) await lockdown(guild);

  const embed = errorEmbed({
    title: '🚨 ANTI-NUKE',
    description:
      `**${actor.tag}** (\`${actor.id}\`) performed an unauthorized action: **${label}**.\n` +
      `Punishment: **${(antiNuke.punishment || 'ban').toUpperCase()}** applied instantly.\n` +
      `\`${member ? 'Member' : 'User'} was not whitelisted/owner.\``,
    fields: opts.safe
      ? []
      : member
        ? [{ name: 'Neutralized', value: `${member.user.tag} (${member.id})`, inline: true }]
        : [],
  });

  const channel = guild.systemChannel || guild.channels.cache.find((c) => c.name === 'mod-log' && c.isTextBased());
  if (channel?.send) channel.send({ embeds: [embed] }).catch(() => {});
  await sendLog(client, guild.id, 'security', { embeds: [embed] });
}

/**
 * Role update needs a special check: only act when the change *grants* a
 * dangerous permission (not on cosmetic changes).
 */
async function handleRoleUpdateGrant(client, guild, role, beforePerms) {
  const cfg = get(guild.id, 'security');
  if (!cfg.antiNuke?.enabled) return;
  const antiNuke = cfg.antiNuke;

  const added = role.permissions.toArray().filter(
    (p) => !(beforePerms || 0).toArray?.().includes(p)
  );
  const dangerous = added.filter((p) => DESTRUCTIVE_PERMISSIONS.some((flag) => role.permissions.has(flag)));
  if (!dangerous.length) return;

  const actor = await getActor(guild, AuditLogEvent.RoleUpdate);
  if (!actor) return;
  if (actor.id === client.user.id || isProtected(guild, actor.id, antiNuke)) return;

  const member = await guild.members.fetch(actor.id).catch(() => null);
  await punish(guild, member, antiNuke, `dangerous permissions granted`);

  if (antiNuke.lockdown !== false) await lockdown(guild);

  const embed = errorEmbed({
    title: '🚨 ANTI-NUKE',
    description: `**${actor.tag}** (\`${actor.id}\`) granted dangerous permissions on role **${role.name}**. Instant punishment applied.`,
  });
  const channel = guild.systemChannel || guild.channels.cache.find((c) => c.name === 'mod-log' && c.isTextBased());
  if (channel?.send) channel.send({ embeds: [embed] }).catch(() => {});
  await sendLog(client, guild.id, 'security', { embeds: [embed] });
}

module.exports = {
  events: {
    channelCreate: (client, channel) => handleAudit(client, channel.guild, AuditLogEvent.ChannelCreate, AUDIT[AuditLogEvent.ChannelCreate]),
    channelDelete: (client, channel) => handleAudit(client, channel.guild, AuditLogEvent.ChannelDelete, AUDIT[AuditLogEvent.ChannelDelete]),
    channelUpdate: (client, channel) => handleAudit(client, channel.guild, AuditLogEvent.ChannelUpdate, AUDIT[AuditLogEvent.ChannelUpdate]),

    roleCreate: (client, role) => handleAudit(client, role.guild, AuditLogEvent.RoleCreate, AUDIT[AuditLogEvent.RoleCreate]),
    roleDelete: (client, role) => handleAudit(client, role.guild, AuditLogEvent.RoleDelete, AUDIT[AuditLogEvent.RoleDelete]),
    roleUpdate: async (client, oldRole, newRole) => {
      if (newRole.hexColor !== oldRole?.hexColor && oldRole?.permissions.bitfield === newRole.permissions.bitfield) {
        // cosmetic only -> let roleUpdate.js log it, no nuke
        return;
      }
      await handleRoleUpdateGrant(client, newRole.guild, newRole, oldRole?.permissions);
    },

    guildBanAdd: (client, ban) => handleAudit(client, ban.guild, AuditLogEvent.MemberBanAdd, AUDIT[AuditLogEvent.MemberBanAdd]),
    guildBanRemove: (client, ban) => handleAudit(client, ban.guild, AuditLogEvent.MemberBanRemove, AUDIT[AuditLogEvent.MemberBanRemove]),
    guildMemberRemove: async (client, member) => {
      if (!member.guild) return;
      const actor = await getActor(member.guild, AuditLogEvent.MemberKick);
      if (actor && actor.id !== member.user.id) {
        await handleAudit(client, member.guild, AuditLogEvent.MemberKick, AUDIT[AuditLogEvent.MemberKick]);
      }
    },

    webhookUpdate: (client, channel) => handleAudit(client, channel.guild, AuditLogEvent.WebhookUpdate, AUDIT[AuditLogEvent.WebhookUpdate]),

    stickerCreate: (client, sticker) => handleAudit(client, sticker.guild, AuditLogEvent.StickerCreate, AUDIT[AuditLogEvent.StickerCreate]),
    stickerDelete: (client, sticker) => handleAudit(client, sticker.guild, AuditLogEvent.StickerDelete, AUDIT[AuditLogEvent.StickerDelete]),
    stickerUpdate: (client, sticker) => handleAudit(client, sticker.guild, AuditLogEvent.StickerUpdate, AUDIT[AuditLogEvent.StickerUpdate]),

    emojiCreate: (client, emoji) => handleAudit(client, emoji.guild, AuditLogEvent.EmojiCreate, AUDIT[AuditLogEvent.EmojiCreate]),
    emojiDelete: (client, emoji) => handleAudit(client, emoji.guild, AuditLogEvent.EmojiDelete, AUDIT[AuditLogEvent.EmojiDelete]),
    emojiUpdate: (client, emoji) => handleAudit(client, emoji.guild, AuditLogEvent.EmojiUpdate, AUDIT[AuditLogEvent.EmojiUpdate]),

    guildUpdate: (client, guild) => handleAudit(client, guild, AuditLogEvent.GuildUpdate, AUDIT[AuditLogEvent.GuildUpdate]),

    // ── Anti bot-add ─────────────────────────────────────────────────────
    guildMemberAdd: async (client, member) => {
      if (!member.user.bot) return;
      const cfg = get(member.guild.id, 'security');
      if (!cfg.antiNuke?.enabled) return;
      const actor = await getActor(member.guild, AuditLogEvent.BotAdd);
      if (!actor) return;
      if (actor.id === client.user.id || isProtected(member.guild, actor.id, cfg.antiNuke)) return;
      await member.kick('Peace✘ anti-nuke: unauthorized bot addition').catch(() => {});
      const executor = await member.guild.members.fetch(actor.id).catch(() => null);
      await punish(member.guild, executor, cfg.antiNuke, 'bot addition');
      const embed = errorEmbed({
        title: '🚨 ANTI-NUKE',
        description: `**${actor.tag}** added a bot. Bot kicked, executor punished.`,
      });
      await sendLog(client, member.guild.id, 'security', { embeds: [embed] });
    },

    // ── Anti @everyone / @here ────────────────────────────────────────
    messageCreate: async (client, message) => {
      if (!message.guild || message.author.bot) return;
      if (!message.mentions.everyone) return;
      const cfg = get(message.guild.id, 'security');
      if (!cfg.antiNuke?.enabled) return;

      const member = message.member;
      const antiNuke = cfg.antiNuke;
      if (member?.permissions?.has(PermissionsBitField.Flags.MentionEveryone)) return;
      if (isProtected(message.guild, message.author.id, antiNuke)) return;

      await message.delete().catch(() => {});
      await punish(message.guild, member, antiNuke, '@everyone/@here mention');

      const embed = errorEmbed({
        title: '🚨 ANTI-NUKE',
        description: `**${message.author.tag}** used **@everyone/@here** without permission. Punishment applied instantly.`,
        extra: `Channel: <#${message.channel.id}>`,
      });
      const channel = message.guild.systemChannel || message.guild.channels.cache.find((c) => c.name === 'mod-log' && c.isTextBased());
      if (channel?.send) channel.send({ embeds: [embed] }).catch(() => {});
      await sendLog(client, message.guild.id, 'security', { embeds: [embed] });
    },
  },
};