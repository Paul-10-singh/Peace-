/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Verification System Setup
 */
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
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
      const imageUrl = interaction.options.getString('image_url');

      // Save to settings
      set(interaction.guild.id, 'verification', { roleId: role.id });

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
      
      // Reply ephemerally to the command user
      await interaction.reply({ content: `✅ Verification panel has been set up!\n🔒 Server locked down for unverified members.\n🔓 Assigned role: ${role}`, ephemeral: true });
    } 
    else if (sub === 'disable') {
      set(interaction.guild.id, 'verification', { roleId: null });
      await interaction.reply({ content: '❌ Verification system disabled. Ensure you delete any old panels manually.', ephemeral: true });
    }
  },
};
