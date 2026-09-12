/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /skipto - jump straight to a queue position (skipping everything before it).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skipto')
    .setDescription('Skip to a specific position in the queue')
    .addIntegerOption((o) =>
      o.setName('position').setDescription('Queue position to jump to (1 = current, 2 = next, ...)').setRequired(true).setMinValue(1)
    ),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const position = interaction.options.getInteger('position');
    const arr = queue.tracks.data;
    if (position === 1) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'That is the track currently playing.' })] });
    }
    if (position < 1 || position > arr.length + 1) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `The queue only has **${arr.length}** upcoming track(s).` })],
      });
    }
    // Remove all tracks up to (but excluding) the target, then skip the next one.
    const target = arr[position - 2];
    const removeUpTo = position - 2;
    const guild = interaction.guild.id;
    for (let i = 0; i < removeUpTo; i++) client.music.removeAt(guild, 0);
    queue.node.skip();
    return reply(interaction, { embeds: [successEmbed({ description: `⏩ Skipped to **${target?.title || 'track'}**.` })] });
  },
};
