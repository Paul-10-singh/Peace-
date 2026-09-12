/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /history - show recently played tracks.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { chunkFieldValue } = require('../../utils/helpers');
const { commandEmbed, errorEmbed } = require('../../utils/decorations');
const { formatDuration } = require('../../music/format');

module.exports = {
  data: new SlashCommandBuilder().setName('history').setDescription('Show recently played tracks'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    const tracks = queue?.history?.data || [];
    if (!tracks.length) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'No history yet.' })], ephemeral: true });
    }
    const lines = tracks.slice(0, 15).map((t, i) => {
      return `\`${i + 1}.\` **${t.title}**${t.author ? ` — ${t.author}` : ''} \`${formatDuration(t.durationMS || 0)}\``;
    });
    const chunks = chunkFieldValue(lines);
    await reply(interaction, {
      embeds: [commandEmbed({ title: 'Playback History', fields: chunks.map((c) => ({ name: '\u200b', value: c })) })],
    });
  },
};
