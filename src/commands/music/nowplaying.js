/*
 * Peace✘ - Music Command: /nowplaying
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed } = require('../../utils/decorations');
const { buildNowPlayingEmbed, buildMusicButtons } = require('../../music/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('View the currently playing song with interactive controls'),
  async execute(interaction, client) {
    const queue = client.distube?.getQueue(interaction.guildId);
    if (!queue || !queue.songs[0]) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'There is nothing playing in this server right now.' })],
        ephemeral: true,
      });
    }

    const embed = buildNowPlayingEmbed(queue, queue.songs[0]);
    const components = buildMusicButtons(queue);

    return reply(interaction, {
      embeds: [embed],
      components,
    });
  },
};
