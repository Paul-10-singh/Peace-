/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /channel - channel management toolkit (Owner only). Subcommands:
 * hide, show, nsfw, slowmode.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed, commandEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Channel management (Owner only)')
    .addSubcommand((s) => s.setName('hide').setDescription('Hide a channel from @everyone')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (defaults to this one)').setRequired(false)))
    .addSubcommand((s) => s.setName('show').setDescription('Make a hidden channel visible again')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (defaults to this one)').setRequired(false)))
    .addSubcommand((s) => s.setName('nsfw').setDescription('Toggle NSFW on a text channel')
      .addBooleanOption((o) => o.setName('enabled').setDescription('true = NSFW on, false = off').setRequired(true))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (defaults to this one)').setRequired(false)))
    .addSubcommand((s) => s.setName('slowmode').setDescription('Set channel slowmode')
      .addIntegerOption((o) => o.setName('seconds').setDescription('Seconds between messages (0 = off, max 21600)').setRequired(true).setMinValue(0).setMaxValue(21600))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (defaults to this one)').setRequired(false))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (sub === 'hide' || sub === 'show') {
      try {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: sub === 'hide' }, { reason: `${sub === 'hide' ? 'Hidden' : 'Shown'} by ${interaction.user.tag}` });
        return reply(interaction, {
          embeds: [successEmbed({ title: sub === 'hide' ? 'Channel hidden' : 'Channel shown', description: `<#${channel.id}> is now ${sub === 'hide' ? 'hidden from' : 'visible to'} @everyone.` })],
        });
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
      }
    }

    if (sub === 'nsfw') {
      if (!channel.isTextBased()) return reply(interaction, { embeds: [errorEmbed({ description: 'That is not a text channel.' })], ephemeral: true });
      const enabled = interaction.options.getBoolean('enabled');
      try {
        await channel.setNSFW(enabled, `NSFW ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);
        return reply(interaction, {
          embeds: [successEmbed({ title: enabled ? '🔞 NSFW on' : 'NSFW off', description: `<#${channel.id}> is now ${enabled ? 'age-restricted' : 'safe for work'}.` })],
        });
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
      }
    }

    if (sub === 'slowmode') {
      if (!channel.isTextBased() || channel.type === 4) return reply(interaction, { embeds: [errorEmbed({ description: 'That is not a text channel.' })], ephemeral: true });
      const seconds = interaction.options.getInteger('seconds');
      try {
        await channel.setRateLimitPerUser(seconds, `Slowmode changed by ${interaction.user.tag}`);
        return reply(interaction, {
          embeds: [
            commandEmbed({
              title: '⏱️ Slowmode',
              description: seconds === 0 ? `Slowmode **off** in <#${channel.id}>.` : `Slowmode set to **${seconds}s** in <#${channel.id}>.`,
            }),
          ],
        });
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
      }
    }
  },
};