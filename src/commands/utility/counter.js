/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Counter Configuration Command
 */
const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { BRAND } = require('../../utils/decorations');
const store = require('../../utils/counter/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('counter')
    .setDescription('Premium Counter Configuration Panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set up or update a counter channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('The channel to turn into a counter')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )

        .addIntegerOption((opt) =>
          opt
            .setName('start')
            .setDescription('The starting number (default: 0)')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Counter mode')
            .addChoices(
              { name: 'Numbers Only (1, 2, 3)', value: 'numbers_only' },
              { name: 'Math & Numbers (2, 1+1, 6/2)', value: 'numbers_arithmetic' }
            )
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a counter channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('The channel to remove')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('View counter status for a channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('The channel to view')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const targetChannel = interaction.options.getChannel('channel');

    if (sub === 'setup') {
      const start = interaction.options.getInteger('start') || 0;
      const mode = interaction.options.getString('mode') || 'numbers_only';

      // Add to store
      store.getOrCreateChannel({
        channelId: targetChannel.id,
        guildId: interaction.guild.id,
        mode: mode,
        current: Math.max(0, start - 1), // It expects the next message to be `current + 1`, so if start is 1, current is 0
        best: 0,
        resets: 0,
        ruins: 0,
        paused: false
      });

      const embed = new EmbedBuilder()
        .setColor(BRAND.module)
        .setTitle('🔢 Counter Setup Complete')
        .setDescription(`Successfully configured the counter channel!`)
        .addFields(
          { name: 'Channel', value: `<#${targetChannel.id}>`, inline: true },
          { name: 'Next Number', value: `**${start}**`, inline: true }
        )
        .setFooter({ text: 'Premium Counter System' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      await targetChannel.send({ embeds: [embed] }).catch(() => {});
      await targetChannel.send({ content: `${start}` }).catch(() => {});
    } 
    else if (sub === 'remove') {
      store.deleteChannel(targetChannel.id);
      
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🔢 Counter Removed')
        .setDescription(`Successfully removed the counter configuration from <#${targetChannel.id}>.`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
    else if (sub === 'status') {
      const config = store.getChannel(targetChannel.id);
      
      if (!config) {
        return interaction.reply({ content: `❌ <#${targetChannel.id}> is not configured as a counter channel.`, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(BRAND.module)
        .setTitle('🔢 Counter Status Panel')
        .addFields(
          { name: 'Channel', value: `<#${targetChannel.id}>`, inline: true },
          { name: 'Current Count', value: `**${config.current}**`, inline: true },
          { name: 'Best Score', value: `**${config.best}**`, inline: true }
        )
        .setFooter({ text: 'Premium Counter System' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
