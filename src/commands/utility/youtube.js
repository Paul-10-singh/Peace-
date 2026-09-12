const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('youtube')
    .setDescription('Search YouTube (Owner only)')
    .addStringOption((o) => o.setName('query').setDescription('Search terms').setRequired(true)),
  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const query = interaction.options.getString('query');
      const results = await client.music.search(query, { limit: 5 });
      const lines = (results.tracks || []).map((track, index) => `**${index + 1}.** [${track.title}](${track.url})${track.author ? ` — ${track.author}` : ''}`);
      return interaction.editReply({ embeds: [lines.length ? commandEmbed({ title: 'YouTube search', description: lines.join('\n') }) : errorEmbed({ description: 'No results found.' })] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed({ description: `Search failed: ${err.message}` })] });
    }
  },
};