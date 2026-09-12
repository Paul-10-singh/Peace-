/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, warningEmbed } = require('../../utils/decorations');
const { get, set } = require('../../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antispam')
    .setDescription('Configure anti-spam protection')
    .addSubcommand((s) => s.setName('on').setDescription('Enable anti-spam')
      .addIntegerOption((o) => o.setName('max').setDescription('Max messages in the interval (default 5)').setMinValue(2).setMaxValue(20))
      .addIntegerOption((o) => o.setName('interval').setDescription('Interval in seconds (default 5)').setMinValue(1).setMaxValue(30)))
    .addSubcommand((s) => s.setName('off').setDescription('Disable anti-spam'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = get(interaction.guild.id, 'security');

    if (sub === 'on') {
      config.antiSpam = {
        enabled: true,
        maxMessages: interaction.options.getInteger('max') || 5,
        intervalMs: (interaction.options.getInteger('interval') || 5) * 1000,
      };
      set(interaction.guild.id, 'security', config);
      await reply(interaction, {
        embeds: [successEmbed({
          title: 'Anti-Spam Enabled',
          description: 'Spam protection is now active.',
          fields: [
            { name: 'Max messages', value: `${config.antiSpam.maxMessages}`, inline: true },
            { name: 'Interval', value: `${config.antiSpam.intervalMs / 1000}s`, inline: true },
          ],
        })],
      });
    } else {
      config.antiSpam = { enabled: false };
      set(interaction.guild.id, 'security', config);
      await reply(interaction, {
        embeds: [warningEmbed({ title: 'Anti-Spam Disabled', description: 'Spam protection is now disabled.' })],
      });
    }
  },
};
