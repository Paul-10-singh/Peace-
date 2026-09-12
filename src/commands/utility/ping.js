/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { infoEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check the bot\'s latency and uptime'),
  async execute(interaction, client) {
    const sent = (await interaction.deferReply({ withResponse: true })).resource.message;
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;

    const embed = infoEmbed({
      title: 'Pong',
      fields: [
        { name: 'Roundtrip', value: `${roundtrip}ms`, inline: true },
        { name: 'WebSocket', value: `${client.ws.ping}ms`, inline: true },
        { name: 'Uptime', value: `${Math.floor(client.uptime / 1000)}s`, inline: true },
      ],
    });

    await interaction.editReply({ embeds: [embed] });
  },
};