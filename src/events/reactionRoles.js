/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const settings = require('../utils/settings');

function buildKey(reaction) {
  const emoji = reaction.emoji;
  return `${reaction.message.channelId}:${reaction.message.id}:${emoji.id ? `custom:${emoji.id}` : `unicode:${emoji.name}`}`;
}

function findBinding(guildId, key) {
  const list = settings.get(guildId, 'reactionroles');
  return list.find((e) => e.key === key) || null;
}

module.exports = {
  events: {
    async messageReactionAdd(client, reaction, user) {
      if (user.bot || !reaction.message.guildId) return;
      if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch { return; }
      }
      if (reaction.partial) {
        try { await reaction.fetch(); } catch { return; }
      }
      const binding = findBinding(reaction.message.guildId, buildKey(reaction));
      if (!binding) return;
      const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      const role = reaction.message.guild.roles.cache.get(binding.roleId);
      if (!role) return;
      if (role.position >= reaction.message.guild.members.me.roles.highest.position) return;
      await member.roles.add(role.id, 'Reaction role').catch(() => {});
    },

    async messageReactionRemove(client, reaction, user) {
      if (user.bot || !reaction.message.guildId) return;
      if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch { return; }
      }
      if (reaction.partial) {
        try { await reaction.fetch(); } catch { return; }
      }
      const binding = findBinding(reaction.message.guildId, buildKey(reaction));
      if (!binding) return;
      const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      await member.roles.remove(binding.roleId, 'Reaction role removed').catch(() => {});
    },
  },
};