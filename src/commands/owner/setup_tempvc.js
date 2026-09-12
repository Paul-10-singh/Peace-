/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /setup_tempvc - point the bot at a "creation" voice channel. Every member
 * who joins that channel gets a private temporary voice channel created for
 * them, is moved into it, and the temp channel is deleted once empty.
 * Configured persistently ("tempvc" key); the voiceStateUpdate listener in
 * src/events/voiceStateUpdate.js does the runtime work. Owner only.
 */
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { successEmbed, commandEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('setup_tempvc')
    .setDescription('Set the temporary voice channel creation channel (Owner only)')
    .addSubcommand((s) =>
      s.setName('set').setDescription('Choose the creation voice channel')
        .addChannelOption((o) => o.setName('creation_channel').setDescription('Voice channel to watch').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Disable temporary voice channels')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'remove') {
      set(interaction.guild.id, 'tempvc', { channelId: null, rooms: {} });
      return reply(interaction, {
        embeds: [commandEmbed({ title: 'Temp VC Disabled', description: 'Temporary voice channels are now off.' })],
      });
    }

    const channel = interaction.options.getChannel('creation_channel');
    if (channel.type !== ChannelType.GuildVoice) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'That is not a voice channel.' })], ephemeral: true });
    }
    set(interaction.guild.id, 'tempvc', { channelId: channel.id });
    await reply(interaction, {
      embeds: [successEmbed({ title: 'Temp VC Setup', description: `Joining <#${channel.id}> will now create a private temporary voice channel.` })],
    });
  },
};