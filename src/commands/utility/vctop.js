/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /vctop - server-wide leaderboard of this week's VC activity, showing the
 * hourly target, live (reconciled) totals and ACTIVE / INACTIVE status.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply, chunkFieldValue } = require('../../utils/helpers');
const { categoryEmbed } = require('../../utils/decorations');
const { E } = require('../../utils/vcTracker');
const vcTracker = require('../../utils/vcTracker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vctop')
    .setDescription('View the server-wide VC time leaderboard for this week.')
    .addIntegerOption((option) =>
      option
        .setName('top')
        .setDescription('How many members to show (default 10, max 25)')
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false)
    ),

  async execute(interaction, client) {
    await interaction.deferReply();

    const limit = interaction.options.getInteger('top') || 10;
    const guildId = interaction.guild.id;
    const { startDate, endDate } = vcTracker.getWeekRange(0);

    const guildStats = vcTracker.getGuildStats(guildId, startDate, endDate);
    const across = new Map([
      ...guildStats,
      ...[...interaction.guild.voiceStates.cache.values()].map((s) => [
        s.member?.id,
        vcTracker.getLiveSeconds(s.member?.id, guildId),
      ]),
    ]);

    const rows = [...across.entries()]
      .filter(([userId, seconds]) => userId && seconds > 0)
      .map(([userId, seconds]) => ({ userId, seconds, hours: seconds / 3600 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, limit);

    if (!rows.length) {
      return reply(
        interaction,
        { content: `${E.wrong} No VC activity recorded in this guild for \`${startDate}\` to \`${endDate}\`.` },
        true
      );
    }

    const lines = rows.map((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${String(i + 1).padStart(2, '0')}\``;
      const status = r.hours >= vcTracker.WEEKLY_GOAL_HOURS ? E.ACTIVEstatus : E.INACTIVEstatus;
      return `${medal} <@${r.userId}> — **${vcTracker.formatHMS(r.seconds)}** ${status}`;
    });

    const embed = categoryEmbed('utility', {
      title: `🏆 VC Leaderboard — ${interaction.guild.name}`,
      description: `Period: \`${startDate}\` to \`${endDate}\`\nGoal: \`${vcTracker.WEEKLY_GOAL_HOURS} hrs\` to be **ACTIVE**\u200b`,
      fields: chunkFieldValue(lines).map((value, i) => ({
        name: `Top ${rows.length} (Part ${i + 1})`,
        value,
        inline: false,
      })),
    });

    await reply(interaction, { embeds: [embed] });
  },
};