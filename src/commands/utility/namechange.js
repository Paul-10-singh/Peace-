/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { sendLog } = require('../../utils/logging');
const { warningEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('namechange')
    .setDescription('Change a member nickname')
    .addStringOption((o) => o.setName('nickname').setDescription('New nickname').setRequired(true))
    .addUserOption((o) => o.setName('user').setDescription('The member to rename'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  async execute(interaction) {
    const nickname = interaction.options.getString('nickname').trim();
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) return reply(interaction, { embeds: [warningEmbed({ description: 'That user is not in this server.' })], ephemeral: true });
    if (!member.manageable) return reply(interaction, { embeds: [warningEmbed({ description: 'I cannot change that user’s nickname.' })], ephemeral: true });
    if (interaction.member.id !== interaction.guild.ownerId && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'You cannot change the nickname of that member.' })], ephemeral: true });
    }

    await member.setNickname(nickname, `Nickname changed by ${interaction.user.tag}`);

    const embed = successEmbed({
      title: 'Nickname updated',
      description: `${user.tag} is now **${nickname}**.`,
      extra: `By ${interaction.user.tag}`,
    });

    await reply(interaction, { embeds: [embed] });
    await sendLog(interaction.client, interaction.guild.id, 'nickname', { embeds: [embed] });
  },
};
