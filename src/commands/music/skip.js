/*
 * Peace✘ - Music Command: /skip
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing song'),
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
        embeds: [errorEmbed({ description: 'You must be in the same voice channel as the bot to skip songs.' })],
        ephemeral: true,
      });
    }

    try {
      if (queue.songs.length <= 1 && !queue.autoplay) {
        queue.stop();
        return reply(interaction, {
          embeds: [successEmbed({ description: '⏭️ Skipped track. No more songs left in queue.' })],
        });
      }

      await queue.skip();
      return reply(interaction, {
        embeds: [successEmbed({ description: '⏭️ Skipped to the next song.' })],
      });
    } catch (err) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `Could not skip song: ${err.message}` })],
        ephemeral: true,
      });
    }
  },
};
