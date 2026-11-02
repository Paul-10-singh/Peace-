/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /exit - configure and test server exit/leave messages (Owner only).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { successEmbed, warningEmbed, commandEmbed } = require('../../utils/decorations');
const { buildExitPayload, resolveExitChannel } = require('../../utils/welcome');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('exit')
    .setDescription('Configure and test server exit/leave messages (Owner only)')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set up the exit message channel')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Channel where exit messages will be sent').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Preview the exit message')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Channel to send preview into (defaults to current channel)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('enable').setDescription('Enable exit messages')
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Disable exit messages')
    )
    .addSubcommand((sub) =>
      sub.setName('info').setDescription('View current exit configuration')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const current = get(guildId, 'farewell');

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      if (!channel?.isTextBased()) {
        return reply(interaction, {
          embeds: [warningEmbed({ description: 'Please choose a valid text channel for exit messages.' })],
          ephemeral: true,
        });
      }

      const updated = {
        ...current,
        enabled: true,
        channelId: channel.id,
      };

      set(guildId, 'farewell', updated);

      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'Exit Messages Configured',
            description: `✅ Exit channel set to <#${channel.id}>\n\nUse \`/exit test\` to preview the message!`,
          }),
        ],
      });
    }

    if (sub === 'test') {
      const targetChannel =
        interaction.options.getChannel('channel') ||
        interaction.channel ||
        resolveExitChannel(interaction.guild, current);

      if (!targetChannel?.isTextBased()) {
        return reply(interaction, {
          embeds: [warningEmbed({ description: 'Could not find a valid text channel to send preview.' })],
          ephemeral: true,
        });
      }

      const payload = buildExitPayload({
        guild: interaction.guild,
        user: interaction.user,
        memberCount: interaction.guild.memberCount,
      });

      await targetChannel.send(payload).catch((err) => {
        return reply(interaction, {
          embeds: [warningEmbed({ description: `Failed to send preview: ${err.message}` })],
          ephemeral: true,
        });
      });

      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'Exit Preview Sent',
            description: `A sample exit message has been sent to <#${targetChannel.id}>.`,
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'enable') {
      set(guildId, 'farewell', { ...current, enabled: true });
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Exit Enabled', description: 'Exit messages are now active.' })],
      });
    }

    if (sub === 'disable') {
      set(guildId, 'farewell', { ...current, enabled: false });
      return reply(interaction, {
        embeds: [commandEmbed({ title: 'Exit Disabled', description: 'Exit messages have been turned off.' })],
      });
    }

    if (sub === 'info') {
      const exitChannel = current.channelId ? `<#${current.channelId}>` : 'Auto-detect (`#exit`/`#farewell`)';

      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: 'Exit Configuration',
            description:
              `**Status:** ${current.enabled !== false ? '🟢 Enabled' : '🔴 Disabled'}\n` +
              `**Exit Channel:** ${exitChannel}`,
          }),
        ],
      });
    }
  },
};
