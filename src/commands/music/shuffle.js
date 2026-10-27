/*
 * Peace✘ - Music Command: /shuffle
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Randomly shuffle the music queue'),
  async execute(interaction, client) {
    const queue = client.distube?.getQueue(interaction.guildId);
    if (!queue || queue.songs.length <= 1) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'Not enough songs in the queue to shuffle.' })],
        ephemeral: true,
      });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    const botVoiceId = interaction.guild?.members?.me?.voice?.channelId;
    if (!voiceChannel || voiceChannel.id !== botVoiceId) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'You must be in the same voice channel as the bot to shuffle.' })],
        ephemeral: true,
      });
    }

    queue.shuffle();
    return reply(interaction, {
      embeds: [successEmbed({ description: `🔀 Shuffled **${queue.songs.length}** songs in the queue!` })],
    });
  },
};
