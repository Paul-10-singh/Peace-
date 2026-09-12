/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member for a duration')
    .addUserOption((o) => o.setName('user').setDescription('The user to timeout').setRequired(true))
    .addIntegerOption((o) => o.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the timeout'))
    .setDefaultMemberPermissions(null),
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const minutes = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = interaction.guild.members.cache.get(target.id);

    if (!member) return reply(interaction, { content: 'That user is not in this server.', ephemeral: true });
    if (!member.moderatable) return reply(interaction, { content: 'I cannot timeout that user.', ephemeral: true });
    if (interaction.member.id !== interaction.guild.ownerId && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return reply(interaction, { content: 'You cannot timeout that user.', ephemeral: true });
    }

    await member.timeout(minutes * 60 * 1000, reason);

    const embed = commandEmbed({
      title: '<:timeout:1536416054010445877> Member Timed Out',
      description: `**${target.tag}** has been timed out.`,
      fields: [
        { name: 'User', value: target.tag, inline: true },
        { name: 'Duration', value: `${minutes} minute(s)`, inline: true },
        { name: 'Reason', value: reason },
      ],
      extra: `By ${interaction.user.tag}`,
    });

    await reply(interaction, { embeds: [embed] });
  },
};
