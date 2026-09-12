const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('booster')
    .setDescription('Boost audio volume up to 1000%')
    .addIntegerOption((o) => o.setName('volume').setDescription('201-1000, or 1 to turn booster off').setRequired(true).setMinValue(1).setMaxValue(1000)),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue?.currentTrack) return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    const volume = interaction.options.getInteger('volume');
    if (volume !== 1 && volume < 201) return reply(interaction, { embeds: [errorEmbed({ description: 'Use a booster value from **201** to **1000**, or **1** to turn it off.' })], ephemeral: true });
    const target = volume === 1 ? 70 : volume;
    client.music.setVolume(interaction.guild.id, target);
    return reply(interaction, { embeds: [successEmbed({ description: volume === 1 ? 'Audio booster disabled.' : `Audio booster set to **${volume}%**.` })] });
  },
};