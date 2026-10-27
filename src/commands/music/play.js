/*
 * Peace✘ - Music Command: /play
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, successEmbed } = require('../../utils/decorations');
const { destroyConnection } = require('../../utils/voice247');

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
      const me = interaction.guild.members.me;
      const currentBotChannelId = me?.voice?.channelId;
      const distubeVoice = client.distube?.voices?.get(interaction.guildId);
      const isVoiceReady = distubeVoice?.connection?.state?.status === 'ready';

      // If the bot is not currently connected to voice, or the existing connection is not ready,
      // or the bot is in a different channel, tear down stale connection states cleanly
      if (!currentBotChannelId || !isVoiceReady || currentBotChannelId !== voiceChannel.id) {
        destroyConnection(interaction.guild);
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
      let desc = `Could not play track: \`${err.message.slice(0, 200)}\``;
      if (err.errorCode === 'NO_RESULT') {
        desc = `No tracks found for: **${query}**\nTry searching with song title and artist name.`;
      } else if (err.errorCode === 'NOT_SUPPORTED_URL') {
        desc = `The provided URL is not supported.\nSupported sources: **YouTube**, **Spotify**, **SoundCloud**, or direct audio link.`;
      } else if (err.errorCode === 'VOICE_CONNECT_FAILED') {
        desc = `Could not connect to the voice channel in time. Please check bot permissions and try again.`;
      }
      return interaction.editReply({
        embeds: [errorEmbed({ title: 'Playback Failed', description: desc })],
      });
    }
  },
};
