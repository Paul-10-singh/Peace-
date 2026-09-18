/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /vc247 - keep the bot inside a voice channel 24/7 (Owner only).
 * Subcommands:
 * set <channel> - pick the channel the bot stays in permanently
 * off           - disable 24/7 mode and leave the voice channel
 * status        - show the current 24/7 setup
 *
 * The bot rejoins the saved channel on startup, when kicked, moved or
 * disconnected, and stays even when the channel becomes empty.
 */
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed, commandEmbed } = require('../../utils/decorations');
const { get, set: setSetting } = require('../../utils/settings');
const { connectToVoice, destroyConnection } = require('../../utils/voice247');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('vc247')
    .setDescription('Keep the bot in a voice channel 24/7 (Owner only)')
    .addSubcommand((s) => s.setName('set').setDescription('Make the bot stay in a voice channel 24/7')
      .addChannelOption((o) => o.setName('channel').setDescription('Voice channel to stay in').setRequired(true)))
    .addSubcommand((s) => s.setName('off').setDescription('Turn off 24/7 mode and leave the voice channel'))
    .addSubcommand((s) => s.setName('status').setDescription('Show the current 24/7 status')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const me = guild?.members?.me;
    if (!guild || !me) return reply(interaction, { embeds: [errorEmbed({ description: 'This command can only be used inside a server.' })], ephemeral: true });

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        return reply(interaction, { embeds: [errorEmbed({ description: 'Please pick a valid voice channel.' })], ephemeral: true });
      }
      setSetting(guild.id, 'vc247', { channelId: channel.id });
      try {
        await connectToVoice(guild, channel.id);
        return reply(interaction, {
          embeds: [successEmbed({
            title: '24/7 enabled',
            description: `I will now stay inside <#${channel.id}> around the clock — even if everyone leaves or someone moves me, I'll come right back.`,
          })],
        });
      } catch (err) {
        return reply(interaction, {
          embeds: [successEmbed({
            title: '24/7 enabled',
            description: `Saved <#${channel.id}> as the 24/7 voice channel, but I couldn't join right now (${err.message}). I will connect automatically.`,
          })],
        });
      }
    }

    if (sub === 'off') {
      const { channelId } = get(guild.id, 'vc247');
      setSetting(guild.id, 'vc247', { channelId: null });
      if (channelId && me.voice?.channelId === channelId) {
        await me.voice.disconnect('24/7 mode disabled').catch(() => {});
      }
      destroyConnection(guild);
      return reply(interaction, {
        embeds: [successEmbed({ title: '24/7 disabled', description: 'The bot will leave the voice channel and no longer auto-rejoin.' })],
      });
    }

    if (sub === 'status') {
      const { channelId } = get(guild.id, 'vc247');
      const current = me.voice?.channelId || null;
      const fields = [];

      if (channelId) {
        const channel = guild.channels.cache.get(channelId);
        fields.push({
          name: '24/7 channel',
          value: channel ? `<#${channel.id}>` : `\`${channelId}\` (deleted — run \`/vc247 off\`)`,
          inline: true,
        });
      } else {
        fields.push({ name: '24/7 channel', value: 'Not configured', inline: true });
      }
      fields.push({ name: 'Currently in', value: current ? `<#${current}>` : 'Not in a voice channel', inline: true });

      return reply(interaction, { embeds: [commandEmbed({ title: '24/7 voice status', fields })] });
    }
  },
};