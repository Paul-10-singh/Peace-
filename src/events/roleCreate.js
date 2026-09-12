/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { successEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');

module.exports = {
  name: 'roleCreate',
  async execute(client, role) {
    if (!role.guild) return;

    const embed = successEmbed({
      title: 'Role Created',
      description: `Role **${role.name}** (<@&${role.id}>) was created.`,
      fields: [
        { name: 'Color', value: role.hexColor, inline: true },
        { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
      ],
      extra: `Role ID: ${role.id}`,
    });

    await sendLog(client, role.guild.id, 'role', { embeds: [embed] });
  },
};
