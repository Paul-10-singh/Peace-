/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, warningEmbed, infoEmbed } = require('../../utils/decorations');
const { get, set } = require('../../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scamdetect')
    .setDescription('Configure scam-link detection')
    .addSubcommand((s) => s.setName('on').setDescription('Enable scam detection'))
    .addSubcommand((s) => s.setName('off').setDescription('Disable scam detection'))
    .addSubcommand((s) => s.setName('status').setDescription('Show current scam detection status'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = get(interaction.guild.id, 'security');

    if (sub === 'status') {
      return reply(interaction, {
        embeds: [infoEmbed({
          title: 'Scam Detection',
          description: `Status: **${config.antiLink?.blockScam !== false ? 'ON' : 'OFF'}**`,
        })],
      });
    }

    config.antiLink = config.antiLink || { enabled: false, allow: [], blockScam: true };
    config.antiLink.blockScam = sub === 'on';
    set(interaction.guild.id, 'security', config);

    return reply(interaction, {
      embeds: [config.antiLink.blockScam
        ? successEmbed({ title: 'Scam Detection Enabled', description: 'Scam links will now be blocked automatically.' })
        : warningEmbed({ title: 'Scam Detection Disabled', description: 'Scam links will no longer be blocked.' })],
    });
  },
};
