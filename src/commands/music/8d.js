const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder().setName('8d').setDescription('Toggle the 8D audio effect for playback'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue?.currentTrack) return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    const active = client.music.getActiveFilters(interaction.guild.id).includes('8d');
    if (active) client.music.clearFilters(interaction.guild.id);
    else client.music.setFilter(interaction.guild.id, '8d');
    return reply(interaction, { embeds: [successEmbed({ description: `8D audio **${active ? 'disabled' : 'enabled'}**.` })] });
  },
};