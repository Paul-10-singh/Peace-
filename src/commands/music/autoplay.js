/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /autoplay - toggle autoplay (keeps similar tracks playing forever).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { QueueRepeatMode } = require('../../music/player');

module.exports = {
  data: new SlashCommandBuilder().setName('autoplay').setDescription('Toggle autoplay (similar tracks keep playing)'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const next = queue.repeatMode === QueueRepeatMode.AUTOPLAY ? QueueRepeatMode.OFF : QueueRepeatMode.AUTOPLAY;
    queue.setRepeatMode(next);
    const on = next === QueueRepeatMode.AUTOPLAY;
    return reply(interaction, { embeds: [successEmbed({ description: `Autoplay **${on ? 'enabled' : 'disabled'}**.` })] });
  },
};
