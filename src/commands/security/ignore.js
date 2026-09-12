/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply, chunkFieldValue } = require('../../utils/helpers');
const { successEmbed, commandEmbed } = require('../../utils/decorations');
const { get, set } = require('../../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ignore')
    .setDescription('Ignore a channel from security moderation')
    .addSubcommand((s) => s.setName('add').setDescription('Ignore the current or selected channel')
      .addChannelOption((o) => o.setName('channel').setDescription('The channel to ignore')))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a channel from ignore list')
      .addChannelOption((o) => o.setName('channel').setDescription('The channel to stop ignoring')))
    .addSubcommand((s) => s.setName('list').setDescription('Show channels ignored by security'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = get(interaction.guild.id, 'security');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (sub === 'list') {
      const ignored = config.ignoredChannels || [];
      if (!ignored.length) {
        return reply(interaction, {
          embeds: [commandEmbed({ title: 'Ignored Channels', description: 'No ignored channels.' })],
        });
      }
      const fields = chunkFieldValue(ignored.map((id) => `<#${id}>`)).map((value, i) => ({
        name: i === 0 ? `Ignored Channels (${ignored.length})` : 'Ignored Channels (cont.)',
        value,
      }));
      return reply(interaction, {
        embeds: [commandEmbed({ title: 'Security Ignore List', fields })],
      });
    }

    if (!channel || channel.type !== 0) {
      return reply(interaction, { content: 'Please select a valid text channel.', ephemeral: true });
    }

    const ignoredChannels = new Set(config.ignoredChannels || []);
    if (sub === 'add') {
      if (ignoredChannels.has(channel.id)) {
        return reply(interaction, { content: `${channel} is already ignored.`, ephemeral: true });
      }
      ignoredChannels.add(channel.id);
      config.ignoredChannels = Array.from(ignoredChannels);
      set(interaction.guild.id, 'security', config);
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Channel Ignored', description: `${channel} is now ignored by security moderation.` })],
      });
    }

    if (!ignoredChannels.has(channel.id)) {
      return reply(interaction, { content: `${channel} is not ignored.`, ephemeral: true });
    }
    ignoredChannels.delete(channel.id);
    config.ignoredChannels = Array.from(ignoredChannels);
    set(interaction.guild.id, 'security', config);
    return reply(interaction, {
      embeds: [successEmbed({ title: 'Channel Unignored', description: `${channel} is no longer ignored by security moderation.` })],
    });
  },
};
