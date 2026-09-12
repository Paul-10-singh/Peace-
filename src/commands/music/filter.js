/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /filter - apply or clear an audio filter (ffmpeg presets).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

const FILTERS = [
  { name: 'Off (clear)', value: 'off' },
  { name: '8D', value: '8d' },
  { name: 'Bassboost', value: 'bassboost' },
  { name: 'Bassboost High', value: 'bassboost_high' },
  { name: 'Nightcore', value: 'nightcore' },
  { name: 'Vaporwave', value: 'vaporwave' },
  { name: 'Lofi', value: 'lofi' },
  { name: 'Surround', value: 'surround' },
  { name: 'Subboost', value: 'subboost' },
  { name: 'Karaoke', value: 'karaoke' },
  { name: 'Slow', value: 'slow' },
  { name: 'Tremolo', value: 'tremolo' },
  { name: 'Vibrato', value: 'vibrato' },
  { name: 'Mono', value: 'mono' },
  { name: 'Normalizer', value: 'normalizer' },
  { name: 'Compressor', value: 'compressor' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Apply or clear an audio filter')
    .addStringOption((o) =>
      o.setName('preset').setDescription('Filter preset').setRequired(true).addChoices(
        ...FILTERS.map((f) => ({ name: f.name, value: f.value }))
      )
    ),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const preset = interaction.options.getString('preset');
    if (preset === 'off') {
      client.music.clearFilters(interaction.guild.id);
      return reply(interaction, { embeds: [successEmbed({ description: '🎚️ Filters cleared.' })] });
    }
    const applied = client.music.setFilter(interaction.guild.id, preset);
    if (!applied) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Unknown filter **${preset}**.` })] });
    }
    const name = FILTERS.find((f) => f.value === preset)?.name || preset;
    return reply(interaction, { embeds: [successEmbed({ description: `🎚️ Applied **${name}**.` })] });
  },
};
