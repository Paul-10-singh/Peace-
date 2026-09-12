/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /autoreact - auto-react to messages in a channel with the configured emojis.
 * Restricted: owners + trusted members (bot-wide whitelist).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { requireAccess } = require('../../utils/access');
const { getEmojis, addEmoji, removeEmoji, allConfig } = require('../../utils/autoreact');
const { commandEmbed, warningEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoreact')
    .setDescription('Auto-react to every message in a channel (owners + trusted only)')
    .addSubcommand((s) => s.setName('add').setDescription('Add a reaction to a channel')
      .addChannelOption((o) => o.setName('channel').setDescription('The channel to auto-react in').setRequired(true))
      .addStringOption((o) => o.setName('emoji').setDescription('Emoji (unicode or <:name:id>) to react with').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a reaction from a channel')
      .addChannelOption((o) => o.setName('channel').setDescription('The channel to stop auto-reacting in').setRequired(true))
      .addStringOption((o) => o.setName('emoji').setDescription('The emoji to remove').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show all auto-reaction rules')),
  execute: requireAccess()(async (interaction) => {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const config = allConfig()[interaction.guild.id] || {};
      const lines = Object.entries(config)
        .filter(([, emojis]) => emojis.length)
        .map(([channelId, emojis]) => `<#${channelId}> → ${emojis.join(' ')}`);
      const embed = commandEmbed({
        title: 'Auto-reactions',
        description: lines.length ? lines.join('\n') : 'No auto-reaction rules. Add one with `/autoreact add`.',
      });
      return reply(interaction, { embeds: [embed] });
    }

    const channel = interaction.options.getChannel('channel');
    const emoji = interaction.options.getString('emoji').trim();
    if (!emoji) return reply(interaction, { embeds: [warningEmbed({ description: 'Emoji cannot be empty.' })], ephemeral: true });

    if (sub === 'add') {
      const { added } = addEmoji(interaction.guild.id, channel.id, emoji);
      return reply(
        interaction,
        added
          ? { embeds: [successEmbed({ title: 'Reaction added', description: `${channel} will now react with ${emoji} on every message.` })] }
          : { embeds: [warningEmbed({ title: 'Already configured', description: `${emoji} is already set for ${channel}.` })], ephemeral: true }
      );
    }

    const { removed } = removeEmoji(interaction.guild.id, channel.id, emoji);
    return reply(
      interaction,
      removed
        ? { embeds: [successEmbed({ title: 'Reaction removed', description: `${emoji} was removed from ${channel}.` })] }
        : { embeds: [warningEmbed({ title: 'Rule not found', description: `No rule found for ${emoji} in ${channel}.` })], ephemeral: true }
    );
  }),
};
