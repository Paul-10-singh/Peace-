/*
 * Peace✘ - Music Command: /loop
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Toggle or set loop mode for song or queue')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Loop mode')
        .setRequired(false)
        .addChoices(
          { name: 'Off', value: '0' },
          { name: 'Repeat Song', value: '1' },
          { name: 'Repeat Queue', value: '2' }
        )
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
        embeds: [errorEmbed({ description: 'You must be in the same voice channel as the bot to change loop mode.' })],
        ephemeral: true,
      });
    }

    const modeOption = interaction.options.getString('mode');
    let mode;
    if (modeOption !== null) {
      mode = parseInt(modeOption, 10);
    } else {
      mode = (queue.repeatMode + 1) % 3;
    }

    queue.setRepeatMode(mode);
    const modeName = mode === 1 ? 'Song Repeat 🔂' : mode === 2 ? 'Queue Repeat 🔁' : 'Disabled ❌';

    return reply(interaction, {
      embeds: [successEmbed({ title: '🔁 Loop Mode Updated', description: `Loop mode has been set to: **${modeName}**.` })],
    });
  },
};
