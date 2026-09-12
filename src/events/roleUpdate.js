/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { warningEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');

module.exports = {
  name: 'roleUpdate',
  async execute(client, oldRole, newRole) {
    if (!newRole.guild) return;

    const changes = [];
    if (oldRole && oldRole.name !== newRole.name) {
      changes.push(`**Name:** ${oldRole.name} → ${newRole.name}`);
    }
    if (oldRole && oldRole.hexColor !== newRole.hexColor) {
      changes.push(`**Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
    }
    if (oldRole && oldRole.mentionable !== newRole.mentionable) {
      changes.push(`**Mentionable:** ${oldRole.mentionable ? 'Yes' : 'No'} → ${newRole.mentionable ? 'Yes' : 'No'}`);
    }
    if (oldRole && oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      changes.push('**Permissions:** changed');
    }
    if (!changes.length) return;

    const embed = warningEmbed({
      title: 'Role Updated',
      description: `Role **${newRole.name}** (<@&${newRole.id}>) was updated:\n${changes.join('\n')}`,
      extra: `Role ID: ${newRole.id}`,
    });

    await sendLog(client, newRole.guild.id, 'role', { embeds: [embed] });
  },
};
