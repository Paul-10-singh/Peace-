/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Handles reaction roles: adds role on reaction add, removes role on reaction remove.
 */
const settings = require('../utils/settings');

function normalizeEmoji(emoji) {
  if (!emoji) return '';
  if (typeof emoji === 'object' && emoji.id) return `custom:${emoji.id}`;
  const str = typeof emoji === 'string' ? emoji : (emoji.name || '');
  const customMatch = str.match(/<a?:[\w~]+:(\d+)>/);
  if (customMatch) return `custom:${customMatch[1]}`;
  if (/^\d{17,20}$/.test(str.trim())) return `custom:${str.trim()}`;
  const clean = str.replace(/[\uFE00-\uFE0F\u200D]/g, '').trim();
  return `unicode:${clean}`;
}

function buildKey(channelId, messageId, emoji) {
  return `${channelId}:${messageId}:${normalizeEmoji(emoji)}`;
}

function findBinding(guildId, reaction) {
  const list = settings.get(guildId, 'reactionroles') || [];
  if (!list.length) return null;

  const fullKey = buildKey(reaction.message.channelId, reaction.message.id, reaction.emoji);
  const found = list.find((e) => e.key === fullKey);
  if (found) return found;

  // Fallback match: match message.id and normalized emoji if channelId format differs
  const norm = normalizeEmoji(reaction.emoji);
  return list.find((e) => {
    if (!e.key) return false;
    const parts = e.key.split(':');
    if (parts.length >= 4) {
      const msgId = parts[1];
      const emojiKey = `${parts[2]}:${parts[3]}`;
      return msgId === reaction.message.id && emojiKey === norm;
    }
    return false;
  }) || null;
}

module.exports = {
  normalizeEmoji,
  buildKey,
  findBinding,
  events: {
    async messageReactionAdd(client, reaction, user) {
      if (user.bot) return;

      // Ensure partial message & reaction are fetched
      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch (err) {
          return;
        }
      }
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (err) {
          return;
        }
      }

      const guild = reaction.message.guild;
      if (!guild) return;

      const binding = findBinding(guild.id, reaction);
      if (!binding) return;

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (!me) return;

      if (!me.permissions.has('ManageRoles')) {
        console.warn(`[ReactionRoles] Cannot assign role: bot lacks "Manage Roles" permission in "${guild.name}" (${guild.id})`);
        return;
      }

      const role = guild.roles.cache.get(binding.roleId) || await guild.roles.fetch(binding.roleId).catch(() => null);
      if (!role) {
        console.warn(`[ReactionRoles] Role ID ${binding.roleId} not found in "${guild.name}"`);
        return;
      }

      if (role.position >= me.roles.highest.position) {
        console.warn(`[ReactionRoles] Role hierarchy error: role "${role.name}" is higher than or equal to bot role "${me.roles.highest.name}" in "${guild.name}"`);
        return;
      }

      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role.id, 'Reaction role').catch((err) => {
          console.error(`[ReactionRoles] Failed to add role "${role.name}" to ${member.user.tag}: ${err.message}`);
        });
      }
    },

    async messageReactionRemove(client, reaction, user) {
      if (user.bot) return;

      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch (err) {
          return;
        }
      }
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (err) {
          return;
        }
      }

      const guild = reaction.message.guild;
      if (!guild) return;

      const binding = findBinding(guild.id, reaction);
      if (!binding) return;

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (!me || !me.permissions.has('ManageRoles')) return;

      const role = guild.roles.cache.get(binding.roleId) || await guild.roles.fetch(binding.roleId).catch(() => null);
      if (!role || role.position >= me.roles.highest.position) return;

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role.id, 'Reaction role removed').catch((err) => {
          console.error(`[ReactionRoles] Failed to remove role "${role.name}" from ${member.user.tag}: ${err.message}`);
        });
      }
    },
  },
};
