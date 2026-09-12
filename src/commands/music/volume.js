/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /volume - set the music volume (1-200%).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the music volume (1-200%)')
    .addIntegerOption((o) => o.setName('percent').setDescription('Volume percent (1-200)').setRequired(false)),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const percent = interaction.options.getInteger('percent');
    if (percent == null) {
      return reply(interaction, { embeds: [successEmbed({ description: `Current volume is **${queue.node.volume}%**` })] });
    }
    const clamped = Math.max(1, Math.min(200, percent));
    queue.node.setVolume(clamped);
    return reply(interaction, { embeds: [successEmbed({ description: `Volume set to **${clamped}%**` })] });
  },
};
