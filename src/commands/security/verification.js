/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Verification System Setup
 */
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { set } = require('../../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Set up the server verification system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Enable verification and drop the panel in this channel')
        .addRoleOption((opt) =>
          opt
            .setName('role')
            .setDescription('The role to assign when a user verifies')
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt
            .setName('remove_role')
            .setDescription('The role to remove after verification (e.g. Unverified / auto role)')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('image_url')
            .setDescription('Optional: URL of the shield image to use in the embed')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('disable')
        .setDescription('Disable the verification system')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'enable') {
      const role = interaction.options.getRole('role');
      const removeRole = interaction.options.getRole('remove_role');
      const imageUrl = interaction.options.getString('image_url');

      if (removeRole && removeRole.id === role.id) {
        return interaction.reply({
          content: '<a:wrong:1550504971303395430> The role to assign and the role to remove cannot be the same role.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (role.id === interaction.guild.id) {
        return interaction.reply({
          content: '<a:wrong:1550504971303395430> You cannot set @everyone as the verification role.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (removeRole && removeRole.id === interaction.guild.id) {
        return interaction.reply({
          content: '<a:wrong:1550504971303395430> You cannot set @everyone as the role to remove.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
      if (botMember) {
        if (botMember.roles.highest.comparePositionTo(role) <= 0) {
          return interaction.reply({
            content: `<a:wrong:1550504971303395430> My highest role must be higher than ${role} to assign it.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        if (removeRole && botMember.roles.highest.comparePositionTo(removeRole) <= 0) {
          return interaction.reply({
            content: `<a:wrong:1550504971303395430> My highest role must be higher than ${removeRole} to remove it.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // Save to settings
      set(interaction.guild.id, 'verification', {
        roleId: role.id,
        removeRoleId: removeRole ? removeRole.id : null,
      });

      // Create the panel exactly as requested
      const embed = new EmbedBuilder()
        .setColor(0x2B2D31) // Invisible dark theme color
        .setDescription('This server requires you to verify yourself to get access to other channels, you can simply verify by clicking on the verify button.');

      if (imageUrl) {
        embed.setImage(imageUrl);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('server_verify_btn')
          .setLabel('Verify')
          .setStyle(ButtonStyle.Primary) // Blurple
      );

      // Send panel
      await interaction.channel.send({ embeds: [embed], components: [row] });

      // Auto-configure server permissions for verification
      try {
        // 1. Remove ViewChannel from @everyone globally
        await interaction.guild.roles.everyone.setPermissions(
          interaction.guild.roles.everyone.permissions.remove(PermissionFlagsBits.ViewChannel)
        );

        // 2. Grant ViewChannel to the verified role globally
        await role.setPermissions(
          role.permissions.add(PermissionFlagsBits.ViewChannel)
        );

        // 3. Make sure @everyone can still see the verification channel (but not type)
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: false,
          ReadMessageHistory: true
        });
      } catch (err) {
        console.error('[Verification] Failed to auto-configure permissions:', err);
      }
      
      let replyContent = `<a:correct:1550504846199758928> **Verification panel has been set up!**\n🔒 Server locked down for unverified members.\n🔓 Role to assign: ${role}`;
      if (removeRole) {
        replyContent += `\n🗑️ Role to remove: ${removeRole}`;
      }
      await interaction.reply({ content: replyContent, flags: MessageFlags.Ephemeral });
    } 
    else if (sub === 'disable') {
      set(interaction.guild.id, 'verification', { roleId: null, removeRoleId: null });
      await interaction.reply({ content: '<a:correct:1550504846199758928> Verification system disabled. Ensure you delete any old panels manually.', flags: MessageFlags.Ephemeral });
    }
  },
};
