/*
 * Peace✘ - Music Command: /play
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
