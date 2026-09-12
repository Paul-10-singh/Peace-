/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /clear - clear the entire queue without stopping current playback.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder().setName('clear').setDescription('Clear the music queue'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const count = queue.tracks.data.length;
    if (count === 0) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'The queue is already empty.' })] });
    }
    queue.tracks.clear();
    return reply(interaction, { embeds: [successEmbed({ description: `🧹 Cleared **${count}** track(s) from the queue.` })] });
  },
};
