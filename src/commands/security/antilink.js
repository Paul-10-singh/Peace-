/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { openPanel } = require('../../utils/securityPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antilink')
    .setDescription('Open the link-protection panel (on/off, allow, scam links)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    return openPanel(interaction, 'antiLink');
  },
};