/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Show bot support information and help links'),
  async execute(interaction) {
    const supportUrl = process.env.SUPPORT_URL || null;
    const description = supportUrl
      ? `Need help? Join the support server: <${supportUrl}>`
      : 'Need help? Ask the bot owner or use the server support channel.';

    const embed = commandEmbed({
      title: 'Support',
      description,
      extra: 'Bot support',
    });

    await reply(interaction, { embeds: [embed] });
  },
};
