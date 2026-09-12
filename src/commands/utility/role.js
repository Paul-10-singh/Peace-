/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { warningEmbed, infoEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('List a member\'s roles')
    .addSubcommand((s) => s.setName('list').setDescription('List all roles of a member')
      .addUserOption((o) => o.setName('user').setDescription('The member (defaults to you)')))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) return reply(interaction, { embeds: [warningEmbed({ description: 'That user is not in this server.' })], ephemeral: true });

    if (sub === 'list') {
      const roles = member.roles.cache.filter((r) => r.id !== interaction.guild.id).map((r) => `<@&${r.id}>`).join(' ') || 'None';
      return reply(interaction, {
        embeds: [
          infoEmbed({
            author: { name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) },
            description: `**Roles (${member.roles.cache.size - 1}):**\n${roles}`,
          }),
        ],
      });
    }

  },
};