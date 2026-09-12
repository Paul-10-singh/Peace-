/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /forceskip - skip the current track regardless of who requested it.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder().setName('forceskip').setDescription('Skip the current track (any user)'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const track = queue.currentTrack;
    queue.node.skip();
    return reply(interaction, { embeds: [successEmbed({ description: `⏭️ Force-skipped **${track.title}**.` })] });
  },
};
