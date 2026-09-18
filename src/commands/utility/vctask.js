/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /vctask - show weekly VC time for all members with a role.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply, chunkFieldValue } = require('../../utils/helpers');
const { categoryEmbed } = require('../../utils/decorations');
const { E } = require('../../utils/vcTracker');
const vcTracker = require('../../utils/vcTracker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vctask')
    .setDescription('Show weekly VC time for all members with a role.')
    .addRoleOption((option) =>
      option.setName('role').setDescription('The role to check').setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply();

    const role = interaction.options.getRole('role');

    let members;
    try {
      const all = await interaction.guild.members.fetch({ cache: true });
      members = all.filter((m) => m.roles.cache.has(role.id) && !m.user.bot);
    } catch {
      members = role.members.filter((m) => !m.user.bot);
    }

    if (!members.size) {
      return reply(interaction, { content: `No members found with role ${role}.` }, true);
    }

    const { startDate, endDate } = vcTracker.getWeekRange(0);
    const rows = [];
    for (const m of members.values()) {
      const stats = vcTracker.getUserStats(m.id, interaction.guild.id, startDate, endDate);
      const hours = (stats.totalSeconds + vcTracker.getLiveSeconds(m.id, interaction.guild.id)) / 3600;
      rows.push({ m, hours });
    }
    rows.sort((a, b) => b.hours - a.hours);

    const lines = rows.map((r, i) => {
      const status = r.hours >= vcTracker.WEEKLY_GOAL_HOURS ? E.correct : E.wrong;
      return `\`${String(i + 1).padStart(2, '0')}\` <@${r.m.id}> — **${vcTracker.formatHMS(r.hours * 3600)}** ${status}`;
    });

    const embed = categoryEmbed('utility', {
      title: `VC Task — ${role.name}`,
      description: `Members: **${rows.length}**\nPeriod: \`${startDate}\` to \`${endDate}\`\nGoal: \`${vcTracker.WEEKLY_GOAL_HOURS} hrs\`\u200b`,
      fields: chunkFieldValue(lines).map((value, i) => ({
        name: `Weekly VC Time (${i + 1})`,
        value,
        inline: false,
      })),
    });

    await reply(interaction, { embeds: [embed] });
  },
};