/*
 * Peace✘ - Music Command: /play
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');
const { reply } = require('../../utils/helpers');
const { errorEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or playlist from YouTube, Spotify, SoundCloud, or direct link')
    .addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Song title, artist name, or URL')
        .setRequired(true)
    ),
  async execute(interaction, client) {
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'You must be in a voice channel to use `/play`!' })],
        ephemeral: true,
      });
    }

    const permissions = voiceChannel.permissionsFor(interaction.guild.members.me || client.user);
    if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'I do not have permission to **Connect** or **Speak** in your voice channel!' })],
        ephemeral: true,
      });
    }

    const query = interaction.options.getString('query');
    await interaction.deferReply();

    try {
      // If an unmanaged @discordjs/voice connection exists (e.g. from 24/7 or /connect),
      // tear it down cleanly so DisTube can create and manage its voice connection without VOICE_ALREADY_CREATED
      const existingConn = getVoiceConnection(interaction.guildId);
      if (existingConn && !client.distube?.voices?.has(interaction.guildId)) {
        try {
          existingConn.destroy();
        } catch {}
      }

      await client.distube.play(voiceChannel, query, {
        textChannel: interaction.channel,
        member: interaction.member,
      });

      return interaction.editReply({
        embeds: [
          successEmbed({
            title: '🔍 Request Dispatched',
            description: `Searching and queuing: **${query}**\n*(Playback will start in <#${voiceChannel.id}>)*`,
          }),
        ],
      });
    } catch (err) {
      console.error('[PeaceX] [Play Command Error]:', err);
      return interaction.editReply({
        embeds: [errorEmbed({ title: 'Playback Failed', description: `Could not play track: \`${err.message.slice(0, 200)}\`` })],
      });
    }
  },
};
