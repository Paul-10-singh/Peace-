/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { openPanel } = require('../../utils/securityPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scamdetect')
    .setDescription('Open the scam-detection panel (on/off + banner image)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    return openPanel(interaction, 'scamDetect');
  },
};