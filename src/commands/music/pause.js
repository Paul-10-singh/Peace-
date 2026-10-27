/*
 * Peace✘ - Music Command: /pause
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, successEmbed, warningEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause current music playback'),
  async execute(interaction, client) {
    const queue = client.distube?.getQueue(interaction.guildId);
    if (!queue || !queue.songs[0]) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'There is nothing playing in this server right now.' })],
        ephemeral: true,
      });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    const botVoiceId = interaction.guild?.members?.me?.voice?.channelId;
    if (!voiceChannel || voiceChannel.id !== botVoiceId) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'You must be in the same voice channel as the bot to pause music.' })],
        ephemeral: true,
      });
    }

    if (queue.paused) {
      return reply(interaction, {
        embeds: [warningEmbed({ description: 'Music playback is already paused. Use `/resume` to continue.' })],
        ephemeral: true,
      });
    }

    queue.pause();
    return reply(interaction, {
      embeds: [successEmbed({ description: '⏸️ Paused music playback.' })],
    });
  },
};
