/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /resume - resume playback.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume the music'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    if (!queue.node.isPaused()) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Already playing.' })] });
    }
    queue.node.resume();
    return reply(interaction, { embeds: [successEmbed({ description: 'Resumed ▶️' })] });
  },
};
