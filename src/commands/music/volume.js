/*
 * Peace✘ - Music Command: /volume
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, successEmbed, commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('View or change the music playback volume')
    .addIntegerOption((o) =>
      o
        .setName('percent')
        .setDescription('Volume level from 0 to 100')
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(false)
    ),
  async execute(interaction, client) {
    const queue = client.distube?.getQueue(interaction.guildId);
    if (!queue || !queue.songs[0]) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'There is nothing playing in this server right now.' })],
        ephemeral: true,
      });
    }

    const percent = interaction.options.getInteger('percent');
    if (percent === null) {
      return reply(interaction, {
        embeds: [commandEmbed({ title: '🔊 Current Volume', description: `Current volume is set to **${queue.volume}%**.` })],
      });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    const botVoiceId = interaction.guild?.members?.me?.voice?.channelId;
    if (!voiceChannel || voiceChannel.id !== botVoiceId) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'You must be in the same voice channel as the bot to adjust volume.' })],
        ephemeral: true,
      });
    }

    queue.setVolume(percent);
    return reply(interaction, {
      embeds: [successEmbed({ description: `🔊 Playback volume adjusted to **${percent}%**.` })],
    });
  },
};
