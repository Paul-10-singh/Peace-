/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /skip - skip the current track.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const track = queue.currentTrack;
    const next = queue.tracks.data?.[0];
    const ok = queue.node.skip();
    if (ok) {
      return reply(interaction, {
        embeds: [successEmbed({ description: `Skipped **${track.title}**${next ? `\nUp next: **${next.title}**` : ''}` })],
      });
    }
    return reply(interaction, { embeds: [errorEmbed({ description: 'Could not skip.' })] });
  },
};
