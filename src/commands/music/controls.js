const { SlashCommandBuilder } = require('discord.js');
const { buildControlsPayload } = require('../../music/controls');
const { reply } = require('../../utils/helpers');
const { errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder().setName('controls').setDescription('Show the music player controls panel'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue?.currentTrack) return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    return interaction.reply(await buildControlsPayload(queue, interaction.user.tag));
  },
};