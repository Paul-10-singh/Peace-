/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /shuffle - shuffle the queue.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the music queue'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    if (!queue.tracks.data?.length) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing to shuffle in the queue.' })] });
    }
    queue.tracks.shuffle();
    return reply(interaction, { embeds: [successEmbed({ description: 'Queue shuffled. 🔀' })] });
  },
};
