/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /fx - apply/clear stackable audio filters (bassboost, nightcore, vaporwave, ...).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, successEmbed, errorEmbed } = require('../../utils/decorations');

const FX = [
  { name: 'Off', value: 'off' },
  { name: 'Bass', value: 'bass' },
  { name: 'Bassboost', value: 'bassboost' },
  { name: 'Bassboost Low', value: 'bassboost_low' },
  { name: 'Bassboost High', value: 'bassboost_high' },
  { name: '8D', value: '8d' },
  { name: 'Nightcore', value: 'nightcore' },
  { name: 'Vaporwave', value: 'vaporwave' },
  { name: 'Lofi', value: 'lofi' },
  { name: 'Karaoke', value: 'karaoke' },
  { name: 'Surround', value: 'surround' },
  { name: 'Subboost', value: 'subboost' },
  { name: 'Earrape', value: 'earrape' },
  { name: 'Mono', value: 'mono' },
  { name: 'Normalizer', value: 'normalizer' },
  { name: 'Compressor', value: 'compressor' },
  { name: 'Electronic', value: 'electronic' },
  { name: 'Equalizer', value: 'equalizer' },
  { name: 'Party', value: 'party' },
  { name: 'Pop', value: 'pop' },
  { name: 'Radio', value: 'radio' },
  { name: 'Soft', value: 'soft' },
  { name: 'Speed', value: 'speed' },
  { name: 'Treble Bass', value: 'treblebass' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fx')
    .setDescription('Apply or clear audio filters')
    .addStringOption((o) =>
      o
        .setName('preset')
        .setDescription('Choose a filter preset')
        .setRequired(true)
        .addChoices(...FX.map((f) => ({ name: f.name, value: f.value })))
    ),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }

    const preset = interaction.options.getString('preset');

    if (preset === 'off') {
      await queue.filters.setFilters(false).catch(() => {});
      return reply(interaction, { embeds: [successEmbed({ description: 'All audio filters cleared.' })] });
    }

    const ids = client.music.setFilter(interaction.guild.id, preset);
    if (!ids) return reply(interaction, { embeds: [errorEmbed({ description: 'Unknown filter.' })] });

    return reply(interaction, { embeds: [successEmbed({ description: `Applied **${preset}** filter.` })] });
  },
};
