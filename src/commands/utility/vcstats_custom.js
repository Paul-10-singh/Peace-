/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /vcstats_custom - calculate VC time for a custom date period (YYYY-MM-DD).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply, presenceStatus } = require('../../utils/helpers');
const { categoryEmbed } = require('../../utils/decorations');
const { E } = require('../../utils/vcTracker');
const vcTracker = require('../../utils/vcTracker');

function remainingText(hours) {
  const needed = vcTracker.WEEKLY_GOAL_HOURS - hours;
  if (needed <= 0) return `${E.correct} **0 hours** (Goal Met)`;
  return `${E.time} **${vcTracker.formatHMS(needed * 3600)} needed** to become active`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vcstats_custom')
    .setDescription('Calculate VC time for a custom date period (Format: YYYY-MM-DD).')
    .addStringOption((option) =>
      option.setName('start_date').setDescription('Start date (YYYY-MM-DD)').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('end_date').setDescription('End date (YYYY-MM-DD)').setRequired(true)
    )
    .addUserOption((option) =>
      option.setName('member').setDescription('Member to check (defaults to you)').setRequired(false)
    ),

  async execute(interaction, client) {
    await interaction.deferReply();

    const startDate = interaction.options.getString('start_date');
    const endDate = interaction.options.getString('end_date');

    if (!vcTracker.isValidDate(startDate) || !vcTracker.isValidDate(endDate)) {
      return reply(
        interaction,
        { content: `${E.wrong} Incorrect date format! Please use **YYYY-MM-DD** (e.g., \`2026-09-01\`).` },
        true
      );
    }
    if (startDate > endDate) {
      return reply(interaction, { content: `${E.wrong} The start date must be before the end date.` }, true);
    }

    const member = interaction.options.getMember('member') || interaction.member;
    const target = member || interaction.options.getUser('member') || interaction.user;
    const guildId = interaction.guild.id;

    const stats = vcTracker.getUserStats(target.id, guildId, startDate, endDate);
    const liveSeconds = endDate === vcTracker.todayStr() ? vcTracker.getLiveSeconds(target.id, guildId) : 0;
    const totalHours = (stats.totalSeconds + liveSeconds) / 3600;

    const isActive = totalHours >= vcTracker.WEEKLY_GOAL_HOURS;
    const statusStr = isActive
    ? `${E.ACTIVEstatus} **ACTIVE** (Goal Completed! ${E.goalcompleted})`
    : `${E.INACTIVEstatus} **INACTIVE**`;

    let breakdown;
    if (Object.keys(stats.dailyMap).length) {
      breakdown = Object.keys(stats.dailyMap)
        .sort()
        .map((date) => `**${date}**: \`${vcTracker.formatHMS(stats.dailyMap[date])}\``)
        .join('\n');
    } else {
      breakdown = '*No voice activity recorded in this period.*';
    }

    const embed = categoryEmbed('utility', {
      title: `Custom VC Stats: ${target.displayName || target.username}`,
      description: `**Custom Period:** \`${startDate}\` to \`${endDate}\``,
      fields: [
        { name: 'Total Calculated Time', value: `\`${vcTracker.formatHMS(totalHours * 3600)}\``, inline: true },
        { name: 'Target Goal', value: `\`${vcTracker.WEEKLY_GOAL_HOURS} hrs\``, inline: true },
        { name: 'Hours Needed to Complete', value: remainingText(totalHours), inline: false },
        { name: `${E.status} Period Status`, value: `${statusStr}\n• Discord: ${presenceStatus(member)}`, inline: false },
        { name: 'Daily Recorded Breakdown', value: breakdown, inline: false },
      ],
    });

    await reply(interaction, { embeds: [embed] });
  },
};