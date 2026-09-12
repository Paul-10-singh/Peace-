/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { warningEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(client, oldMember, newMember) {
    const guild = newMember.guild;
    if (!guild) return;

    // Nickname changes
    if (oldMember && oldMember.nickname !== newMember.nickname) {
      const embed = warningEmbed({
        title: 'Nickname Changed',
        description:
          `**${newMember.user.username}** (<@${newMember.id}>) nickname changed:\n` +
          `**Before:** ${oldMember.nickname || '(none)'}\n` +
          `**After:** ${newMember.nickname || '(none)'}`,
      });

      await sendLog(client, guild.id, 'nickname', { embeds: [embed] });
    }

    // Role changes
    if (!oldMember) return;
    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());
    const added = [...newRoles].filter((id) => !oldRoles.has(id) && id !== guild.id);
    const removed = [...oldRoles].filter((id) => !newRoles.has(id) && id !== guild.id);
    if (!added.length && !removed.length) return;

    const parts = [];
    if (added.length) parts.push(`**Added:** ${added.map((id) => `<@&${id}>`).join(', ')}`);
    if (removed.length) parts.push(`**Removed:** ${removed.map((id) => `<@&${id}>`).join(', ')}`);

    const embed = warningEmbed({
      title: 'Roles Updated',
      description: `**${newMember.user.username}** (<@${newMember.id}>) roles changed:\n${parts.join('\n')}`,
    });

    await sendLog(client, guild.id, 'role', { embeds: [embed] });
  },
};
