/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { warningEmbed, successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleicon')
    .setDescription('Set or clear a role icon')
    .addRoleOption((o) => o.setName('role').setDescription('The role to update').setRequired(true))
    .addStringOption((o) => o.setName('icon').setDescription('Image URL for the new role icon (PNG/JPG/GIF)'))
    .addBooleanOption((o) => o.setName('clear').setDescription('Clear the role icon'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const role = interaction.options.getRole('role');
    const iconUrl = interaction.options.getString('icon');
    const clear = interaction.options.getBoolean('clear');

    if (clear && iconUrl) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'Please either provide an icon URL or clear the icon, not both.' })], ephemeral: true });
    }
    if (!clear && !iconUrl) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'Please provide an image URL or set clear=true.' })], ephemeral: true });
    }
    if (role.managed || role.id === interaction.guild.id) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'I cannot modify that role.' })], ephemeral: true });
    }
    if (role.position >= interaction.member.roles.highest.position && interaction.member.id !== interaction.guild.ownerId) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'You cannot modify a role higher than your highest role.' })], ephemeral: true });
    }
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'My highest role is below that role, so I cannot modify it.' })], ephemeral: true });
    }

    try {
      await role.edit({ icon: clear ? null : iconUrl }, `Role icon updated by ${interaction.user.tag}`);
      return reply(interaction, {
        embeds: [
          clear
            ? successEmbed({ title: 'Role icon cleared', description: `Cleared the icon for ${role.name}.` })
            : successEmbed({ title: 'Role icon updated', description: `Updated the icon for ${role.name}.` }),
        ],
      });
    } catch (error) {
      console.error('[roleicon] role.edit error:', error);
      return reply(interaction, { embeds: [errorEmbed({ description: 'Failed to update the role icon. Ensure the URL is a valid image and the bot has permission to manage this role.' })], ephemeral: true });
    }
  },
};
