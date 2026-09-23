/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Channel Management System
 */
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Manage channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Set the status text of a voice channel')
        .addChannelOption((opt) =>
          opt
            .setName('vc')
            .setDescription('The voice channel to set the status for')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('The status text to display under the channel name')
            .setRequired(true)
            .setMaxLength(500)
        )
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const vc = interaction.options.getChannel('vc');
      const statusText = interaction.options.getString('name');

      try {
        // Voice statuses were added recently, we can use the discord REST api directly to be safe
        // PUT /channels/{channel.id}/voice-status
        await client.rest.put(`/channels/${vc.id}/voice-status`, {
          body: { status: statusText },
        });

        await interaction.reply({
          content: `<a:correct:1550504846199758928> Successfully updated the status of <#${vc.id}> to:\n\`${statusText}\``,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.error(`[PeaceX] [Channel] Failed to set voice status for ${vc.id}:`, err.message);
        await interaction.reply({
          content: '<a:wrong:1550504971303395430> Failed to update the voice channel status. Ensure I have the **Set Voice Channel Status** permission and the text is valid.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
