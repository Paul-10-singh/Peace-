/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { openPanel } = require('../../utils/securityPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antispam')
    .setDescription('Open the anti-spam panel (rate-limit protection)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    return openPanel(interaction, 'antiSpam');
  },
};