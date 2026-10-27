/*
 * Peace✘ - Music Command: /seek
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply, formatDuration } = require('../../utils/helpers');
const { errorEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a specific timestamp in the current song')
    .addIntegerOption((o) =>
      o
        .setName('seconds')
        .setDescription('Timestamp in seconds to jump to')
        .setMinValue(0)
        .setRequired(true)
    ),
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
        embeds: [errorEmbed({ description: 'You must be in the same voice channel as the bot to seek.' })],
        ephemeral: true,
      });
    }

    const seconds = interaction.options.getInteger('seconds');
    if (seconds >= queue.songs[0].duration) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `Cannot seek beyond song duration (\`${queue.songs[0].formattedDuration}\`).` })],
        ephemeral: true,
      });
    }

    queue.seek(seconds);
    return reply(interaction, {
      embeds: [successEmbed({ description: `⏩ Jumped playback position to **${seconds}s** (\`${formatDuration(seconds * 1000)}\`).` })],
    });
  },
};
