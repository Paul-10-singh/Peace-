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
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption((o) => o.setName('user').setDescription('The user to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the kick'))
    .setDefaultMemberPermissions(null),
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = interaction.guild.members.cache.get(target.id);

    if (!member) return reply(interaction, { content: 'That user is not in this server.', ephemeral: true });
    if (!member.kickable) return reply(interaction, { content: 'I cannot kick that user (they may have a higher role than me).', ephemeral: true });
    if (interaction.member.id !== interaction.guild.ownerId && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return reply(interaction, { content: 'You cannot kick that user.', ephemeral: true });
    }

    await member.kick(reason);

    const embed = commandEmbed({
      title: '<a:warning:1550504965955653723> Member Kicked',
      description: `**${target.tag}** has been kicked from the server.`,
      fields: [
        { name: 'User', value: target.tag, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason },
      ],
      extra: `By ${interaction.user.tag}`,
    });

    await reply(interaction, { embeds: [embed] });
    await sendLog(interaction.client, interaction.guild.id, 'moderation', { embeds: [embed] });

    try {
      await target.send(`You were kicked from **${interaction.guild.name}**.\nReason: ${reason}`);
    } catch {}
  },
};
