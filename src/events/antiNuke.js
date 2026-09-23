/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * ANTI-NUKE — instant-action protection (concept ported from Peace✘ᴾᴿᴼ.
 * Rebuilt on the 2026 ten-layer security platform; see src/security/).
 *
 * The Pro build treats every *single* unauthorized destructive audit-log action
 * as a nuke attempt and neutralizes the executor immediately (it does not wait
 * for a burst threshold). This elevator is strictly faster and stronger than
 * the old window-based "4 events in 12s" detector, so that detector is removed.
 *
 * This file is now a thin adapter: every event is routed through
 * security.gateway.onAuditEvent, which
 *   - dispatches through the zero-trust capability engine (Layer 1) —
 *     owners, whitelisted users/roles and holders of capability grants are
 *     authorized and never punished;
 *   - appends to the tamper-evident audit ledger (Layer 6);
 *   - opens a resumable, rollback-able incident playbook (Layer 7) on an
 *     unauthorized hit: instant punish + lockdown + incident channel.
 *
 * Protected surface: channels, roles (incl. dangerous permission grants),
 * bans/unbans/kicks, webhooks, stickers, emoji, server settings, bot
 * additions, @everyone/@here mentions.
 */
const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const { get } = require('../utils/settings');
const { getActor } = require('../security/auditResolver');
const { sendLog } = require('../utils/logging');
const { errorEmbed } = require('../utils/decorations');

// Audit types we watch, mapped to a zero-trust capability + human label.
const AUDIT = {
  [AuditLogEvent.ChannelCreate]:    [{ cap: 'channel.create', label: 'channel created' }],
  [AuditLogEvent.ChannelDelete]:    [{ cap: 'channel.delete', label: 'channel deleted' }],
  [AuditLogEvent.ChannelUpdate]:    [{ cap: 'channel.update', label: 'channel updated' }],
  [AuditLogEvent.RoleCreate]:       [{ cap: 'role.create',    label: 'role created' }],
  [AuditLogEvent.RoleDelete]:       [{ cap: 'role.delete',    label: 'role deleted' }],
  [AuditLogEvent.RoleUpdate]:       [{ cap: 'role.update',    label: 'role updated' }],
  [AuditLogEvent.MemberBanAdd]:     [{ cap: 'ban',            label: 'member banned' }],
  [AuditLogEvent.MemberBanRemove]:  [{ cap: 'kick',           label: 'member unbanned' }],
  [AuditLogEvent.MemberKick]:       [{ cap: 'kick',           label: 'member kicked' }],
  [AuditLogEvent.WebhookCreate]:    [{ cap: 'webhook.manage', label: 'webhook created' }],
  [AuditLogEvent.WebhookDelete]:    [{ cap: 'webhook.manage', label: 'webhook deleted' }],
  [AuditLogEvent.WebhookUpdate]:    [{ cap: 'webhook.manage', label: 'webhook updated' }],
  [AuditLogEvent.StickerCreate]:    [{ cap: 'emoji.manage',   label: 'sticker created' }],
  [AuditLogEvent.StickerDelete]:    [{ cap: 'emoji.manage',   label: 'sticker deleted' }],
  [AuditLogEvent.StickerUpdate]:    [{ cap: 'emoji.manage',   label: 'sticker updated' }],
  [AuditLogEvent.EmojiCreate]:      [{ cap: 'emoji.manage',   label: 'emoji created' }],
  [AuditLogEvent.EmojiDelete]:      [{ cap: 'emoji.manage',   label: 'emoji deleted' }],
  [AuditLogEvent.EmojiUpdate]:      [{ cap: 'emoji.manage',   label: 'emoji updated' }],
  [AuditLogEvent.GuildUpdate]:      [{ cap: 'guild.update',   label: 'server settings changed' }],
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

/**
 * Core: resolve the executor of one audit event and, unless protected,
 * route through the security platform's audit gateway.
 */
async function handleAudit(client, guild, auditType, opts = {}) {
  if (!guild) return;
  const cfg = get(guild.id, 'security');
  if (!cfg.antiNuke?.enabled) return;

  const actor = await getActor(guild, auditType);
  if (!actor) return;
  // the bot itself never triggers
  if (actor.id === client.user.id) return;

  const spec = AUDIT[auditType]?.[0] || opts.fallback || { cap: opts.cap, label: opts.label };
  const gateway = require('../security/gateway');
  return gateway.onAuditEvent(client, {
    guild,
    capability: spec.cap,
    label: opts.label || spec.label,
    actor,
    entityId: opts.entityId || null,
    metadata: opts.metadata || {},
  });
}

/**
 * Role update needs a special check: only act when the change *grants* a
 * dangerous permission (not on cosmetic changes).
 */
async function handleRoleUpdateGrant(client, guild, role, beforePerms) {
  const cfg = get(guild.id, 'security');
  if (!cfg.antiNuke?.enabled) return;

  const added = role.permissions.toArray().filter((p) => !(beforePerms || 0).toArray?.().includes(p));
  const dangerous = added.filter((p) => DESTRUCTIVE_PERMISSIONS.some((flag) => role.permissions.has(flag)));
  if (!dangerous.length) return;

  const actor = await getActor(guild, AuditLogEvent.RoleUpdate);
  if (!actor || actor.id === client.user.id) return;

  const gateway = require('../security/gateway');
  return gateway.onRoleGrant(client, guild, role, beforePerms);
}

module.exports = {
  events: {
    channelCreate: (client, channel) => handleAudit(client, channel.guild, AuditLogEvent.ChannelCreate),
    channelDelete: (client, channel) => handleAudit(client, channel.guild, AuditLogEvent.ChannelDelete),
    channelUpdate: (client, channel) => handleAudit(client, channel.guild, AuditLogEvent.ChannelUpdate),

    roleCreate: (client, role) => handleAudit(client, role.guild, AuditLogEvent.RoleCreate),
    roleDelete: (client, role) => handleAudit(client, role.guild, AuditLogEvent.RoleDelete),
    roleUpdate: async (client, oldRole, newRole) => {
      if (newRole.hexColor !== oldRole?.hexColor && oldRole?.permissions.bitfield === newRole.permissions.bitfield) {
        // cosmetic only -> let roleUpdate.js log it, no nuke
        return;
      }
      await handleRoleUpdateGrant(client, newRole.guild, newRole, oldRole?.permissions);
    },

    guildBanAdd: (client, ban) => handleAudit(client, ban.guild, AuditLogEvent.MemberBanAdd),
    guildBanRemove: async (client, ban) => {
      const actor = await getActor(ban.guild, AuditLogEvent.MemberBanRemove);
      if (!actor || actor.id === client.user.id) return;
      await handleAudit(client, ban.guild, AuditLogEvent.MemberBanRemove);
    },
    guildMemberRemove: async (client, member) => {
      if (!member.guild) return;
      const actor = await getActor(member.guild, AuditLogEvent.MemberKick);
      if (actor && actor.id !== member.user.id) {
        await handleAudit(client, member.guild, AuditLogEvent.MemberKick);
      }
    },

    webhookUpdate: (client, channel) => handleAudit(client, channel.guild, AuditLogEvent.WebhookUpdate),

    stickerCreate: (client, sticker) => handleAudit(client, sticker.guild, AuditLogEvent.StickerCreate),
    stickerDelete: (client, sticker) => handleAudit(client, sticker.guild, AuditLogEvent.StickerDelete),
    stickerUpdate: (client, sticker) => handleAudit(client, sticker.guild, AuditLogEvent.StickerUpdate),

    emojiCreate: (client, emoji) => handleAudit(client, emoji.guild, AuditLogEvent.EmojiCreate),
    emojiDelete: (client, emoji) => handleAudit(client, emoji.guild, AuditLogEvent.EmojiDelete),
    emojiUpdate: (client, emoji) => handleAudit(client, emoji.guild, AuditLogEvent.EmojiUpdate),

    guildUpdate: (client, guild) => handleAudit(client, guild, AuditLogEvent.GuildUpdate),

    // ── Anti bot-add ─────────────────────────────────────────────────────
    guildMemberAdd: async (client, member) => {
      if (!member.user.bot) return;
      const gateway = require('../security/gateway');
      await gateway.onBotAdd(client, member);
    },

    // ── Anti @everyone / @here removed (Option A chosen) ──────────────
  },
  handleAudit,
  handleRoleUpdateGrant,
  _auditMap: AUDIT,
};