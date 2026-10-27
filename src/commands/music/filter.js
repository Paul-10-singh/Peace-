/*
 * Peace✘ - Music Command: /filter
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, successEmbed, commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Apply audio equalizers and sound effects')
    .addStringOption((o) =>
      o
        .setName('set')
        .setDescription('Filter to activate or clear')
        .setRequired(true)
        .addChoices(
          { name: 'Clear All Filters (Off)', value: 'off' },
          { name: 'Bass Boost', value: 'bassboost' },
          { name: 'Nightcore', value: 'nightcore' },
          { name: '3D Audio', value: '3d' },
          { name: 'Vaporwave', value: 'vaporwave' },
          { name: 'Flanger', value: 'flanger' },
          { name: 'Echo', value: 'echo' },
          { name: 'Karaoke', value: 'karaoke' }
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
        embeds: [errorEmbed({ description: 'You must be in the same voice channel as the bot to adjust filters.' })],
        ephemeral: true,
      });
    }

    const filter = interaction.options.getString('set');

    if (filter === 'off') {
      queue.filters.clear();
      return reply(interaction, {
        embeds: [successEmbed({ title: '🎛️ Audio Filters Cleared', description: 'Disabled all active audio equalizers and sound filters.' })],
      });
    }

    if (queue.filters.has(filter)) {
      queue.filters.remove(filter);
      return reply(interaction, {
        embeds: [commandEmbed({ title: '🎛️ Filter Removed', description: `Disabled audio filter: **${filter}**.` })],
      });
    }

    queue.filters.add(filter);
    return reply(interaction, {
      embeds: [successEmbed({ title: '🎛️ Filter Applied', description: `Activated audio filter: **${filter}**.\n*(Audio will re-stream with new equalization in a few seconds)*` })],
    });
  },
};
