/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /247 - 24/7 voice mode (Owner only).
 *  - /247 (or mode: on)  -> the bot joins your voice channel and STAYS. It
 *                           still plays/interacts like normal, but never
 *                           leaves on its own.
 *  - mode: end           -> free the bot: 24/7 off, it may disconnect again.
 *  - mode: status        -> show the current 24/7 setup.
 *
 * While 24/7 is active the bot auto-rejoins the saved channel when kicked,
 * moved or disconnected (see src/events/stayVc.js), so it keeps running even
 * if the channel empties or the connection drops.
 */
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed, commandEmbed } = require('../../utils/decorations');
const { get, set: setSetting } = require('../../utils/settings');
const { connectToVoice, destroyConnection } = require('../../utils/voice247');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('24/7 voice mode — bot stays in a voice channel and auto-rejoins (Owner only)')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('What to do (defaults to on)')
        .setRequired(false)
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'End', value: 'end' },
          { name: 'Status', value: 'status' },
        ),
    )
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Voice channel to stay in (defaults to your current one)').setRequired(false),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    const me = guild?.members?.me;
    if (!guild || !me) return reply(interaction, { embeds: [errorEmbed({ description: 'This command can only be used inside a server.' })], ephemeral: true });

    const mode = interaction.options.getString('mode') || 'on';

    if (mode === 'end') {
      const { channelId } = get(guild.id, 'vc247');
      setSetting(guild.id, 'vc247', { channelId: null });
      if (channelId && me.voice?.channelId === channelId) {
        await me.voice.disconnect('24/7 mode ended').catch(() => {});
      }
      destroyConnection(guild);
      return reply(interaction, {
        embeds: [successEmbed({ title: '24/7 ended', description: '24/7 mode is off — the bot is free and may leave the voice channel again.' })],
      });
    }

    if (mode === 'status') {
      const { channelId } = get(guild.id, 'vc247');
      const current = me.voice?.channelId || null;
      const fields = [];
      if (channelId) {
        const channel = guild.channels.cache.get(channelId);
        fields.push({
          name: '24/7 channel',
          value: channel ? `<#${channel.id}>` : `\`${channelId}\` (deleted — run \`/247 mode: end\`)`,
          inline: true,
        });
      } else {
        fields.push({ name: '24/7 channel', value: 'Not configured', inline: true });
      }
      fields.push({ name: 'Currently in', value: current ? `<#${current}>` : 'Not in a voice channel', inline: true });
      return reply(interaction, { embeds: [commandEmbed({ title: '24/7 voice status', fields })] });
    }

    const channel = interaction.options.getChannel('channel') || interaction.member.voice.channel;
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'Please join a voice channel (or pick one with the `channel` option).' })],
        ephemeral: true,
      });
    }

    setSetting(guild.id, 'vc247', { channelId: channel.id });
    try {
      await connectToVoice(guild, channel.id);
      return reply(interaction, {
        embeds: [successEmbed({
          title: '24/7 enabled',
          description: `I am now connected to <#${channel.id}> and will **stay**. If I get disconnected or moved, I'll automatically come back and keep 24/7 active.\n\nUse \`/247 mode: end\` to free me.`,
        })],
      });
    } catch (err) {
      return reply(interaction, {
        embeds: [successEmbed({
          title: '24/7 enabled',
          description: `Saved <#${channel.id}> as the 24/7 voice channel, but I couldn't join right now (${err.message}). I will connect and stay automatically.`,
        })],
      });
    }
  },
};