/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { errorEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');

module.exports = {
  name: 'roleDelete',
  async execute(client, role) {
    if (!role.guild) return;

    const embed = errorEmbed({
      title: 'Role Deleted',
      description: `Role **${role.name}** (ID: ${role.id}) was deleted.`,
      fields: [
        { name: 'Color', value: role.hexColor, inline: true },
        { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
      ],
      extra: `Role ID: ${role.id}`,
    });

    await sendLog(client, role.guild.id, 'role', { embeds: [embed] });
  },
};
