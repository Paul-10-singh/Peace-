/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /lyrics - fetch lyrics for the currently playing track.
 * Uses @flytri/lyrics-finder (Genius public endpoint, no API key).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const lyricsFinder = require('@flytri/lyrics-finder');

module.exports = {
  data: new SlashCommandBuilder().setName('lyrics').setDescription('Show lyrics for the current track'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const track = queue.currentTrack;
    const query = `${track.title} ${track.author || ''}`.trim();
    await interaction.deferReply();

    let lyrics = null;
    try {
      lyrics = await lyricsFinder(query, '');
    } catch {
      lyrics = null;
    }

    if (!lyrics) {
      return interaction.followUp({ embeds: [errorEmbed({ description: `No lyrics found for **${track.title}**.` })], ephemeral: true });
    }

    const embeds = [];
    let remaining = lyrics;
    do {
      const chunk = remaining.slice(0, 4096);
      remaining = remaining.slice(4096);
      embeds.push(
        successEmbed({
          title: embeds.length === 0 ? `🎵 ${track.title}` : undefined,
          description: chunk || ' ',
        })
      );
    } while (remaining.length > 0);

    return interaction.followUp({ embeds });
  },
};
