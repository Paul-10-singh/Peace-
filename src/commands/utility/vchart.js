/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /vchart - server-wide VC activity chart (this week / last week).
 */
const { SlashCommandBuilder } = require('discord.js');
const vcTracker = require('../../utils/vcTracker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vchart')
    .setDescription('View the server-wide VC activity chart.')
    .addStringOption((option) =>
      option
        .setName('period')
        .setDescription('Which week to show (defaults to this week)')
        .setRequired(false)
        .addChoices(
          { name: 'This Week', value: 'this_week' },
          { name: 'Last Week', value: 'last_week' }
        )
    ),

  async execute(interaction, client) {
    await interaction.deferReply();

    const period = interaction.options.getString('period');
    const offset = period === 'last_week' ? 7 : 0;
    const chart = vcTracker.generateWeeklyReport(interaction.guild, offset);

    const chunks = vcTracker.splitMessage(chart);
    await interaction.editReply({ content: chunks[0] });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk });
    }
  },
};