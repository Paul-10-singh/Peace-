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
    .setName('security')
    .setDescription('Master switch for all automatic security features')
    .addSubcommand((s) => s.setName('on').setDescription('Enable all security features'))
    .addSubcommand((s) => s.setName('off').setDescription('Disable all security features'))
    .addSubcommand((s) => s.setName('action').setDescription('Set the punishment for rule breakers')
      .addStringOption((o) => o.setName('action').setDescription('Punishment').setRequired(true)
        .addChoices({ name: 'warn', value: 'warn' }, { name: 'timeout', value: 'timeout' }, { name: 'kick', value: 'kick' })))
    .addSubcommand((s) => s.setName('threshold').setDescription('Warnings before auto-timeout (default 3)')
      .addIntegerOption((o) => o.setName('count').setDescription('Number of warnings').setRequired(true).setMinValue(1).setMaxValue(10)))
    .addSubcommand((s) => s.setName('status').setDescription('Show all security settings'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = get(interaction.guild.id, 'security');

    if (sub === 'on') {
      config.enabled = true;
      set(interaction.guild.id, 'security', config);
      return reply(interaction, {
        embeds: [successEmbed({
          title: 'Security Enabled',
          description: 'All automatic security features are now **on**. Use the individual commands to fine-tune: `/antispam`, `/antilink`, `/words`, `/antinuke`, `/whitelist`',
        })],
      });
    }

    if (sub === 'off') {
      config.enabled = false;
      set(interaction.guild.id, 'security', config);
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Security Disabled', description: 'All automatic security features are now **off**.' })],
        ephemeral: true,
      });
    }

    if (sub === 'action') {
      config.action = interaction.options.getString('action');
      set(interaction.guild.id, 'security', config);
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Punishment Updated', description: `Rule-breaker punishment set to **${config.action}**.` })],
      });
    }

    if (sub === 'threshold') {
      config.warnThreshold = interaction.options.getInteger('count');
      set(interaction.guild.id, 'security', config);
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Warning Threshold Set', description: `Auto-timeout after **${config.warnThreshold}** warnings.` })],
      });
    }

    const format = (enabled) => (enabled ? 'ON' : 'OFF');
    await reply(interaction, {
      embeds: [infoEmbed({
        title: 'Security Overview',
        fields: [
          { name: 'Security (master)', value: format(config.enabled), inline: true },
          { name: 'Anti-spam', value: format(config.antiSpam?.enabled), inline: true },
          { name: 'Anti-link', value: format(config.antiLink?.enabled), inline: true },
          { name: 'Scam-link block', value: format(config.antiLink?.blockScam !== false), inline: true },
          { name: 'Anti-nuke', value: format(config.antiNuke?.enabled), inline: true },
          { name: 'Blocked words', value: `${(config.words || []).length}`, inline: true },
          { name: 'Whitelisted users', value: `${(config.whitelist || []).length}`, inline: true },
          { name: 'Punishment', value: `${config.action}`, inline: true },
          { name: 'Auto-timeout', value: `after ${config.warnThreshold} warnings`, inline: true },
        ],
      })],
    });
  },
};
