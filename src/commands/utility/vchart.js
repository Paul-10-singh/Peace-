/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /vchart - server-wide VC activity chart (this week / last week).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { warningEmbed } = require('../../utils/decorations');
const { isOwner } = require('../../utils/owners');
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
    )
    .addBooleanOption((option) =>
      option
        .setName('dm')
        .setDescription('Send the weekly report to your Direct Messages (DM)')
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName('test_dispatch')
        .setDescription('[Owner Only] Test the Sunday automated report delivery for this server')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const isTestDispatch = interaction.options.getBoolean('test_dispatch') || false;
    const sendToDm = interaction.options.getBoolean('dm') || false;

    // Handle test dispatch (Owner only)
    if (isTestDispatch) {
      if (!isOwner(interaction.user.id, interaction.guild?.id, interaction.guild)) {
        return reply(interaction, {
          embeds: [warningEmbed({ title: 'Permission Denied', description: 'Only server owners or the bot owner can trigger test dispatch.' })],
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });
      const results = await vcTracker.sendSundayWeeklyReports(client, { targetGuildId: interaction.guild.id });

      if (results.deliveredToOwnerDm.length > 0) {
        return reply(interaction, {
          content: `<a:correct:1550504971303395430> Sunday weekly report for **${interaction.guild.name}** was successfully delivered to server owner (<@${interaction.guild.ownerId}>) via DM!`,
          ephemeral: true,
        });
      }

      if (results.fallbackToChannel.length > 0) {
        const item = results.fallbackToChannel[0];
        return reply(interaction, {
          content: `📢 Server owner (<@${interaction.guild.ownerId}>) has DMs closed. The report was delivered to fallback channel: <#${item.channelId}>`,
          ephemeral: true,
        });
      }

      if (results.noActivity.length > 0) {
        return reply(interaction, {
          content: `${vcTracker.E.wrong} No voice chat activity was recorded for **${interaction.guild.name}** this week, so no report was dispatched.`,
          ephemeral: true,
        });
      }

      const reason = results.failed[0]?.reason || 'Unknown error';
      return reply(interaction, {
        content: `<a:wrong:1550504971303395430> Could not deliver weekly report: ${reason}`,
        ephemeral: true,
      });
    }

    // Normal or DM chart viewing
    await interaction.deferReply({ ephemeral: sendToDm });

    const period = interaction.options.getString('period');
    const offset = period === 'last_week' ? 7 : 0;
    const embeds = await vcTracker.buildWeeklyReportEmbeds(interaction.guild, offset, { client });

    if (!embeds.length) {
      return reply(
        interaction,
        { content: `${vcTracker.E.wrong} No voice chat activity recorded for this period.` },
        true
      );
    }

    if (sendToDm) {
      try {
        for (let i = 0; i < embeds.length; i += 10) {
          await interaction.user.send({ embeds: embeds.slice(i, i + 10) });
        }
        return reply(interaction, {
          content: `<a:correct:1550504971303395430> The weekly VC activity report for **${interaction.guild.name}** has been sent to your Direct Messages!`,
          ephemeral: true,
        });
      } catch (dmErr) {
        return reply(interaction, {
          content: `<a:wrong:1550504971303395430> Could not send report to your DM. Please make sure your Discord Direct Messages are enabled in privacy settings.`,
          ephemeral: true,
        });
      }
    }

    await reply(interaction, { embeds: embeds.slice(0, 10) });
    for (let i = 10; i < embeds.length; i += 10) {
      await interaction.followUp({ embeds: embeds.slice(i, i + 10) });
    }
  },
};
