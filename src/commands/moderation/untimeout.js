/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove timeout from a member')
    .addUserOption((o) => o.setName('user').setDescription('The member to remove timeout from').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for removing the timeout'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Timeout removed';
    const member = interaction.guild.members.cache.get(target.id);

    if (!member) return reply(interaction, { content: 'That user is not in this server.', ephemeral: true });
    if (!member.moderatable) return reply(interaction, { content: 'I cannot remove timeout for that user.', ephemeral: true });
    if (interaction.member.id !== interaction.guild.ownerId && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return reply(interaction, { content: 'You cannot remove timeout for that user.', ephemeral: true });
    }

    await member.timeout(null, reason);

    const embed = commandEmbed({
      title: '<a:correct:1550504846199758928> Timeout Removed',
      description: `**${target.tag}** is no longer timed out.`,
      fields: [
        { name: 'User', value: target.tag, inline: true },
        { name: 'Reason', value: reason },
      ],
      extra: `By ${interaction.user.tag}`,
    });

    await reply(interaction, { embeds: [embed] });
  },
};
