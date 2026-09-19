/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /unban - remove a ban from one member, or clear every ban in the server.
 * all:True unbanning runs sequentially (await per member) so Discord's
 * rate limits are respected, with live progress on the deferred reply.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { sendLog } = require('../../utils/logging');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a member, or unban everyone in the server')
    .addUserOption((o) => o.setName('user').setDescription('The user to unban'))
    .addBooleanOption((o) => o.setName('all').setDescription('Unban all banned members'))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the unban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const all = interaction.options.getBoolean('all');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!user && !all) {
      return reply(interaction, { content: 'Specify a **user** or set **all: True**.', ephemeral: true });
    }
    if (user && all) {
      return reply(interaction, { content: 'Use either a **user** or **all: True**, not both.', ephemeral: true });
    }

    const botPerms = interaction.guild.members.me.permissions;
    if (!botPerms.has(PermissionFlagsBits.BanMembers)) {
      return reply(interaction, { content: 'I need the **Ban Members** permission to unban.', ephemeral: true });
    }

    // Single member unban.
    if (user) {
      const ban = await interaction.guild.bans.fetch(user.id).catch(() => null);
      if (!ban) {
        return reply(interaction, { content: `**${user.tag}** is not banned in this server.`, ephemeral: true });
      }

      await interaction.guild.members.unban(user.id, reason);

      const embed = commandEmbed({
        title: '<a:correct:1550504846199758928> Member Unbanned',
        description: `**${user.tag}** can join the server again.`,
        fields: [
          { name: 'User', value: user.tag, inline: true },
          { name: 'Reason', value: reason },
        ],
        extra: `By ${interaction.user.tag}`,
      });

      await reply(interaction, { embeds: [embed] });
      await sendLog(interaction.client, interaction.guild.id, 'moderation', { embeds: [embed] });
      return;
    }

    // Unban everyone - may take a while, so acknowledge first.
    await interaction.deferReply();

    const bans = await interaction.guild.bans.fetch();
    const list = [...bans.values()];
    if (!list.length) {
      return interaction.editReply({
        embeds: [commandEmbed({ title: 'No bans', description: 'There are no banned members in this server.' })],
      });
    }

    let done = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      try {
        await interaction.guild.members.unban(list[i].user.id, `Unban all - ${reason}`);
        done += 1;
      } catch {
        failed += 1;
      }
      if ((i + 1) % 5 === 0 || i === list.length - 1) {
        await interaction.editReply({
          embeds: [
            commandEmbed({
              title: 'Unbanning everyone',
              description: `Unbanned **${done}** of **${list.length}** members...`,
            }),
          ],
        }).catch(() => {});
      }
    }

    const embed = commandEmbed({
      title: '<a:correct:1550504846199758928> Everyone Unbanned',
      description: `Unbanned **${done}** member${done === 1 ? '' : 's'}${failed ? ` · **${failed}** failed` : ''}.`,
      fields: [{ name: 'Reason', value: reason }],
      extra: `By ${interaction.user.tag}`,
    });

    await interaction.editReply({ embeds: [embed] });
    await sendLog(interaction.client, interaction.guild.id, 'moderation', { embeds: [embed] });
  },
};
