/*
 * Peace✘ - Fun Mode Command: /p2
 * Developed by Smith.Code
 *
 * Plays Av2.mp3 in Fun Mode with extreme bass boost, noise, and continuous auto-looping.
 * Restricted to Bot Owner, Server Owner, Admins, and Whitelisted members.
 */
const { SlashCommandBuilder } = require('discord.js');
const { playFunTrack } = require('../../music/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('p2')
    .setDescription('Play Av2 in Fun Mode with extreme bass boost & noise (Admin/Owner/Whitelist only)'),
  async execute(interaction, client) {
    await playFunTrack(interaction, client, '2');
  },
};
