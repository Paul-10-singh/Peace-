/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { sendLog } = require('../../utils/logging');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption((o) => o.setName('user').setDescription('The user to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the ban'))
    .addIntegerOption((o) => o.setName('days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(null),
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const days = interaction.options.getInteger('days') || 0;
    const member = interaction.guild.members.cache.get(target.id);

    if (member && !member.bannable) return reply(interaction, { content: 'I cannot ban that user.', ephemeral: true });
    if (member && interaction.member.id !== interaction.guild.ownerId && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return reply(interaction, { content: 'You cannot ban that user.', ephemeral: true });
    }

    await interaction.guild.members.ban(target.id, { reason, deleteMessageSeconds: days * 86400 });

    const embed = commandEmbed({
      title: '<:ban:1536416046859288577> Member Banned',
      description: `**${target.tag}** has been banned from the server.`,
      fields: [
        { name: 'User', value: target.tag, inline: true },
        { name: 'Duration', value: 'Permanent', inline: true },
        { name: 'Messages Deleted', value: days > 0 ? `${days} day(s)` : 'None', inline: true },
        { name: 'Reason', value: reason },
      ],
      extra: `By ${interaction.user.tag}`,
    });

    await reply(interaction, { embeds: [embed] });
    await sendLog(interaction.client, interaction.guild.id, 'moderation', { embeds: [embed] });

    try {
      await target.send(`You were banned from **${interaction.guild.name}**.\nReason: ${reason}`);
    } catch {}
  },
};
