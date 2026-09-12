/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /stop - stop playback and clear the queue.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { clearPanel } = require('../../music/nowPlaying');

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear the queue'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    clearPanel(interaction.guild.id);
    queue.node.stop();
    queue.clear();
    return reply(interaction, { embeds: [successEmbed({ description: 'Stopped and cleared the queue.' })] });
  },
};
