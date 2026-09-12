/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Get a user\'s avatar')
    .addUserOption((o) => o.setName('user').setDescription('The user (defaults to you)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;

    const embed = commandEmbed({
      title: `${user.tag}'s avatar`,
      image: user.displayAvatarURL({ dynamic: true, size: 1024 }),
    });

    await reply(interaction, {
      embeds: [embed],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: 'Open in browser',
              url: user.displayAvatarURL({ dynamic: true, size: 4096 }),
            },
          ],
        },
      ],
    });
  },
};