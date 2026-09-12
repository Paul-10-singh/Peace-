/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get } = require('../../utils/settings');
const { warningEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Show a member\'s warnings')
    .addUserOption((o) => o.setName('user').setDescription('The user to check (defaults to you)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const config = get(interaction.guild.id, 'security');
    const count = config.warns?.[user.id] || 0;

    const embed = count > 0
      ? warningEmbed({
          title: 'Warnings',
          description: `**${user.tag}** has **${count}** warning(s).`,
          fields: [{ name: 'Warning Count', value: `#${count}`, inline: true }],
          extra: `Checked by ${interaction.user.tag}`,
        })
      : successEmbed({
          title: 'Warnings',
          description: `**${user.tag}** has **${count}** warning(s).`,
          fields: [{ name: 'Warning Count', value: `#${count}`, inline: true }],
          extra: `Checked by ${interaction.user.tag}`,
        });

    await reply(interaction, { embeds: [embed] });
  },
};
