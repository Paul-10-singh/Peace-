/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /remove - remove a specific track from the queue by its position.
 * The current (now playing) track is position 1.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue by position')
    .addIntegerOption((o) =>
      o.setName('position').setDescription('Queue position to remove (1 = now playing index, 2 = next, ...)').setRequired(true).setMinValue(1)
    ),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const position = interaction.options.getInteger('position');
    // Now-playing is index 0 in the queue data? The engine's removeAt uses the queue array.
    const arr = queue.tracks.data;
    if (position < 1 || position > arr.length) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `There are only **${arr.length}** track(s) in the queue. Use a position between 1 and ${arr.length}.` })],
      });
    }
    const removed = arr[position - 1];
    client.music.removeAt(interaction.guild.id, position - 1);
    return reply(interaction, { embeds: [successEmbed({ description: `🗑️ Removed **${removed?.title || 'track'}** from the queue.` })] });
  },
};
