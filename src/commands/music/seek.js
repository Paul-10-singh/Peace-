/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /seek - jump to a position in the current track.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { formatDuration } = require('../../music/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek to a position in the current track')
    .addIntegerOption((o) => o.setName('seconds').setDescription('Seek position in seconds').setRequired(true).setMinValue(0)),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const secs = interaction.options.getInteger('seconds');
    const ok = await queue.node.seek(secs * 1000).catch(() => false);
    if (ok === false) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Could not seek to ${formatDuration(secs * 1000)}.` })] });
    }
    return reply(interaction, { embeds: [successEmbed({ description: `Seeked to **${formatDuration(secs * 1000)}**` })] });
  },
};
