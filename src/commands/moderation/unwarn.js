/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { clearWarns, get } = require('../../utils/settings');
const { successEmbed, infoEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Remove all warnings from a member')
    .addUserOption((o) => o.setName('user').setDescription('The user to unwarn').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const before = get(interaction.guild.id, 'security').warns?.[target.id] || 0;
    clearWarns(interaction.guild.id, target.id);

    const embed = before > 0
      ? successEmbed({
          title: 'Warnings Cleared',
          description: `Cleared **${before}** warning(s) from ${target.tag}.`,
          extra: `By ${interaction.user.tag}`,
        })
      : infoEmbed({
          title: 'No Warnings',
          description: `${target.tag} had no warnings.`,
          extra: `By ${interaction.user.tag}`,
        });

    await reply(interaction, { embeds: [embed] });
  },
};
