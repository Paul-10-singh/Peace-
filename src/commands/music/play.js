/*
 * Peace✘ - Music Command: /play
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Playlist } = require('distube');
const { reply } = require('../../utils/helpers');
const { errorEmbed } = require('../../utils/decorations');
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

      // Resolve track metadata first to construct the minimalist queue notification embed
      const resolved = await client.distube.handler.resolve(query, {
        member: interaction.member,
      });

      await client.distube.play(voiceChannel, resolved, {
        textChannel: interaction.channel,
        member: interaction.member,
      });

      const isPlaylist = resolved instanceof Playlist || Array.isArray(resolved?.songs);
      const songTitle = (resolved.name ? String(resolved.name).slice(0, 150) : 'Unknown Track').trim();
      const songUrl = resolved.url || 'https://discord.com';
      const userMention = `<@${interaction.user.id}>`;

      const description = isPlaylist
        ? `✔ | added to queue [${songTitle}](${songUrl}) (${resolved.songs?.length || 0} tracks) by ${userMention}`
        : `✔ | added to queue [${songTitle}](${songUrl}) by ${userMention}`;

      const queueEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setDescription(description);

      return interaction.editReply({
        embeds: [queueEmbed],
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
