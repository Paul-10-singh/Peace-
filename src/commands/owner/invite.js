/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /invite log - configure where invite-tracking logs are posted.
 * Uses the persistent "logs.invite" channel (same setting used by the
 * invite cache + join logger). Owner only.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { set, get } = require('../../utils/settings');
const { successEmbed, commandEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Configure invite tracking logs (Owner only)')
    .addSubcommandGroup((g) =>
      g.setName('log').setDescription('Invite log channel')
        .addSubcommand((s) => s.setName('set').setDescription('Set the invite log channel')
          .addChannelOption((o) => o.setName('channel').setDescription('Channel to post invite logs in').setRequired(true)))
        .addSubcommand((s) => s.setName('remove').setDescription('Disable invite logging'))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand(false);
    if (sub === 'remove') {
      set(interaction.guild.id, 'logs', { ...get(interaction.guild.id, 'logs'), invite: null });
      return reply(interaction, {
        embeds: [commandEmbed({ title: 'Invite Log Removed', description: 'Invite joining logs are now disabled.' })],
      });
    }

    const channel = interaction.options.getChannel('channel');
    if (!channel || !channel.isTextBased?.()) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'That is not a text channel.' })], ephemeral: true });
    }
    set(interaction.guild.id, 'logs', { ...get(interaction.guild.id, 'logs'), invite: channel.id });
    await reply(interaction, {
      embeds: [successEmbed({ title: 'Invite Log Set', description: `Invite logs will be posted in <#${channel.id}>.` })],
    });
  },
};