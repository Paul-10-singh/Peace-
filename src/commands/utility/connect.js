/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /connect - make the bot join a voice channel (defaults to your current one).
 * While 24/7 mode is active (/247) the bot is already kept in the channel,
 * so this just confirms/nudges the connection.
 */
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { connectToVoice } = require('../../utils/voice247');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Connect the bot to a voice channel (defaults to your current one)')
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Voice channel to join (defaults to your current one)').setRequired(false),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    const me = guild?.members?.me;
    if (!guild || !me) return reply(interaction, { embeds: [errorEmbed({ description: 'This command can only be used inside a server.' })], ephemeral: true });

    const channel = interaction.options.getChannel('channel') || interaction.member.voice?.channel;
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'Please join a voice channel (or pick one with the `channel` option).' })],
        ephemeral: true,
      });
    }

    if (me.voice?.channelId === channel.id) {
      return reply(interaction, {
        embeds: [successEmbed({ description: `I am already connected to <#${channel.id}>.` })],
      });
    }

    try {
      await connectToVoice(guild, channel.id);
      return reply(interaction, {
        embeds: [successEmbed({ description: `Connected — I joined <#${channel.id}>.` })],
      });
    } catch (err) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `Could not connect: ${err.message}` })],
        ephemeral: true,
      });
    }
  },
};