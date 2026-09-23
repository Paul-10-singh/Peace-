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
      
      // Reply ephemerally to the command user
      await interaction.reply({ content: `✅ Verification panel has been set up! Assigned role: ${role}`, ephemeral: true });
    } 
    else if (sub === 'disable') {
      set(interaction.guild.id, 'verification', { roleId: null });
      await interaction.reply({ content: '❌ Verification system disabled. Ensure you delete any old panels manually.', ephemeral: true });
    }
  },
};
