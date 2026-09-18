/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /security - master dashboard for every automatic security feature.
 * Opens a single interactive panel; use the menu to jump between
 * anti-link / anti-nuke / anti-spam / anti-words / anti-bot / anti-raid /
 * scam-detect, or flip the MASTER ON/M OFF switches.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { openPanel } = require('../../utils/securityPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Master security dashboard — switch everything and tune each protection')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    return openPanel(interaction, 'security');
  },
};