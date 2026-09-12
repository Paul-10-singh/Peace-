/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { warningEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock or unlock a text channel (admins only)')
    .addSubcommand((s) =>
      s.setName('lock').setDescription('Lock a channel so only admins can send messages')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to lock (defaults to current)')))
    .addSubcommand((s) =>
      s.setName('unlock').setDescription('Unlock a previously locked channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to unlock (defaults to current)')))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel?.isTextBased?.()) return reply(interaction, { embeds: [warningEmbed({ description: 'That is not a text channel.' })], ephemeral: true });

    if (sub === 'lock') {
      await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false }, { reason: `Locked by ${interaction.user.tag}` });
      return reply(interaction, { embeds: [successEmbed({ title: 'Channel locked', description: `<#${channel.id}> has been locked.` })] });
    }
    await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null }, { reason: `Unlocked by ${interaction.user.tag}` });
    return reply(interaction, { embeds: [successEmbed({ title: 'Channel unlocked', description: `<#${channel.id}> has been unlocked.` })] });
  },
};