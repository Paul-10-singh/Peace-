/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a message as the bot (your command message is auto-deleted)')
    .addStringOption((o) => o.setName('message').setDescription('The message text').setRequired(true))
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to send to (defaults to current)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const text = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (!channel?.isTextBased?.()) {
      return interaction.reply({ content: 'That is not a text channel.', flags: MessageFlags.Ephemeral });
    }
    if (!text.trim()) {
      return interaction.reply({ content: 'Message cannot be empty.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const protectedSayMessages = require('../../events/messageCreate').protectedSayMessages;
    const channelMessages = protectedSayMessages.get(channel.id) || new Map();
    const key = text.slice(0, 2000).toLowerCase();
    channelMessages.set(key, (channelMessages.get(key) || 0) + 1);
    protectedSayMessages.set(channel.id, channelMessages);
    await channel.send(text.slice(0, 2000));
    await interaction.deleteReply().catch(() => {});
  },
};