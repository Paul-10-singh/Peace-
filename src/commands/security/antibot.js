/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { openPanel } = require('../../utils/securityPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antibot')
    .setDescription('Open the anti-bot panel (auto-kick unauthorized bots)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    return openPanel(interaction, 'antiBot');
  },
};