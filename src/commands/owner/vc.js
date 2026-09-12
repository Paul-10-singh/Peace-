/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /vc - full voice toolkit (Owner only). Subcommands:
 * kick, kickall, mute, muteall, unmute, unmuteall, deafen, undeafen,
 * list, moveall, lock, unlock, hide, show.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply, formatDuration } = require('../../utils/helpers');
const { successEmbed, errorEmbed, commandEmbed } = require('../../utils/decorations');

const CHANNEL_OPT = (o) => o.setName('channel').setDescription('Voice channel (defaults to your current one)').setRequired(false);
const USER_OPT = (desc) => (o) => o.setName('user').setDescription(desc).setRequired(true);

function resolveVC(interaction, channelOpt) {
  const channel = channelOpt || interaction.member.voice.channel;
  if (!channel || channel.type !== 2) return { error: 'Please pick a valid voice channel (or join one).' };
  return { channel };
}

function humanMembers(channel) {
  return [...channel.members.values()].filter((m) => !m.user.bot);
}

async function forEach(members, fn) {
  let done = 0;
  for (const member of members) {
    try {
      await fn(member);
      done += 1;
    } catch {}
  }
  return done;
}

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('vc')
    .setDescription('Voice channel toolkit (Owner only)')
    .addSubcommand((s) => s.setName('kick').setDescription('Disconnect a user from voice')
      .addUserOption(USER_OPT('User to disconnect'))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand((s) => s.setName('kickall').setDescription('Disconnect everyone from a voice channel').addChannelOption(CHANNEL_OPT))
    .addSubcommand((s) => s.setName('mute').setDescription('Server-mute a user')
      .addUserOption(USER_OPT('User to mute'))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand((s) => s.setName('muteall').setDescription('Server-mute everyone in a voice channel').addChannelOption(CHANNEL_OPT))
    .addSubcommand((s) => s.setName('unmute').setDescription('Unmute a user').addUserOption(USER_OPT('User to unmute')))
    .addSubcommand((s) => s.setName('unmuteall').setDescription('Unmute everyone in a voice channel').addChannelOption(CHANNEL_OPT))
    .addSubcommand((s) => s.setName('deafen').setDescription('Server-deafen a user')
      .addUserOption(USER_OPT('User to deafen'))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand((s) => s.setName('undeafen').setDescription('Undeafen a user').addUserOption(USER_OPT('User to undeafen')))
    .addSubcommand((s) => s.setName('list').setDescription('List everyone in a voice channel').addChannelOption(CHANNEL_OPT))
    .addSubcommand((s) => s.setName('moveall').setDescription('Move everyone to another voice channel')
      .addChannelOption((o) => o.setName('target').setDescription('Channel to move everyone into').setRequired(true))
      .addChannelOption(CHANNEL_OPT))
    .addSubcommand((s) => s.setName('lock').setDescription('Lock a voice channel so no one can join').addChannelOption(CHANNEL_OPT))
    .addSubcommand((s) => s.setName('unlock').setDescription('Unlock a voice channel').addChannelOption(CHANNEL_OPT))
    .addSubcommand((s) => s.setName('hide').setDescription('Hide a voice channel from @everyone').addChannelOption(CHANNEL_OPT))
    .addSubcommand((s) => s.setName('show').setDescription('Make a hidden voice channel visible again').addChannelOption(CHANNEL_OPT)),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'kick') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason');
      if (!target) return reply(interaction, { embeds: [errorEmbed({ description: 'Could not find that member.' })], ephemeral: true });
      if (!target.voice.channel) return reply(interaction, { embeds: [errorEmbed({ description: `**${target.user.tag}** is not in a voice channel.` })], ephemeral: true });
      try {
        await target.voice.disconnect(reason || 'Kicked from voice by an owner');
        return reply(interaction, { embeds: [successEmbed({ title: 'Voice kicked', description: `Disconnected **${target.user.tag}** from <#${target.voice.channel.id}>${reason ? `.\nReason: ${reason}` : '.'}` })] });
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
      }
    }

    if (sub === 'kickall' || sub === 'muteall' || sub === 'unmuteall') {
      const { channel, error } = resolveVC(interaction, interaction.options.getChannel('channel'));
      if (error) return reply(interaction, { embeds: [errorEmbed({ description: error })], ephemeral: true });
      const members = humanMembers(channel);
      if (!members.length) return reply(interaction, { embeds: [errorEmbed({ description: `No users in <#${channel.id}>.` })], ephemeral: true });

      const action = {
        kickall: { title: 'Voice cleared', desc: 'Disconnected', fn: (m) => m.voice.disconnect('Voice kicked by an owner') },
        muteall: { title: 'Voice muted', desc: 'Server-muted', fn: (m) => m.voice.setMute(true, 'Server-muted by an owner') },
        unmuteall: { title: 'Voice unmuted', desc: 'Unmuted', fn: (m) => m.voice.setMute(false, 'Unmuted by an owner') },
      }[sub];

      const done = await forEach(members, action.fn);
      return reply(interaction, { embeds: [successEmbed({ title: action.title, description: `${action.desc} **${done}** of **${members.length}** users in <#${channel.id}>.` })] });
    }

    if (sub === 'mute' || sub === 'unmute' || sub === 'deafen' || sub === 'undeafen') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason');
      if (!target) return reply(interaction, { embeds: [errorEmbed({ description: 'Could not find that member.' })], ephemeral: true });
      if (sub === 'mute' || sub === 'deafen') {
        if (!target.voice.channel) return reply(interaction, { embeds: [errorEmbed({ description: `**${target.user.tag}** is not in a voice channel.` })], ephemeral: true });
      }
      const spec = {
        mute: { fn: (v) => v.setMute(true, reason || 'Muted by an owner'), title: 'Voice muted', text: 'Server-muted' },
        unmute: { fn: (v) => v.setMute(false, 'Unmuted by an owner'), title: 'Voice unmuted', text: 'Unmuted' },
        deafen: { fn: (v) => v.setDeaf(true, reason || 'Deafened by an owner'), title: 'Voice deafened', text: 'Server-deafened' },
        undeafen: { fn: (v) => v.setDeaf(false, 'Undeafened by an owner'), title: 'Voice undeafened', text: 'Undeafened' },
      }[sub];
      try {
        await spec.fn(target.voice);
        return reply(interaction, { embeds: [successEmbed({ title: spec.title, description: `${spec.text} **${target.user.tag}**${reason ? `.\nReason: ${reason}` : '.'}` })] });
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
      }
    }

    if (sub === 'list') {
      const { channel, error } = resolveVC(interaction, interaction.options.getChannel('channel'));
      if (error) return reply(interaction, { embeds: [errorEmbed({ description: error })], ephemeral: true });
      const members = [...channel.members.values()];
      if (!members.length) return reply(interaction, { embeds: [errorEmbed({ description: `<#${channel.id}> is empty.` })], ephemeral: true });

      const human = members.filter((m) => !m.user.bot);
      const bots = members.filter((m) => m.user.bot);
      const lines = human.map((m, i) => {
        const state = `${m.voice.serverMute ? '🔇 ' : ''}${m.voice.serverDeaf ? '🔕 ' : ''}${m.voice.selfMute ? '🔈 ' : ''}${m.voice.selfDeaf ? '🔇 ' : ''}`.trim();
        return `**${i + 1}.** ${m.user.tag} ${state ? `· ${state}` : ''}${m.joinedAt ? ` · in for ${formatDuration(Date.now() - m.joinedAt)}` : ''}`;
      });
      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: `🎧 ${channel.name}`,
            description: lines.join('\n') || 'No members.',
            extra: `${human.length} user${human.length === 1 ? '' : 's'}${bots.length ? ` · ${bots.length} bot${bots.length === 1 ? '' : 's'}` : ''}`,
          }),
        ],
      });
    }

    if (sub === 'moveall') {
      const target = interaction.options.getChannel('target');
      const { channel: source, error } = resolveVC(interaction, interaction.options.getChannel('channel'));
      if (error) return reply(interaction, { embeds: [errorEmbed({ description: error })], ephemeral: true });
      if (!target || target.type !== 2) return reply(interaction, { embeds: [errorEmbed({ description: 'Please pick a valid target voice channel.' })], ephemeral: true });
      if (target.id === source.id) return reply(interaction, { embeds: [errorEmbed({ description: 'Source and target are the same channel.' })], ephemeral: true });

      const members = humanMembers(source);
      if (!members.length) return reply(interaction, { embeds: [errorEmbed({ description: `No users in <#${source.id}>.` })], ephemeral: true });
      const done = await forEach(members, (m) => m.voice.setChannel(target.id, 'Moved by an owner'));
      return reply(interaction, { embeds: [successEmbed({ title: 'Voice moved', description: `Moved **${done}** of **${members.length}** users from <#${source.id}> to <#${target.id}>.` })] });
    }

    if (sub === 'lock' || sub === 'unlock' || sub === 'hide' || sub === 'show') {
      const { channel, error } = resolveVC(interaction, interaction.options.getChannel('channel'));
      if (error) return reply(interaction, { embeds: [errorEmbed({ description: error })], ephemeral: true });
      const spec = {
        lock: { connect: false, title: '🔇 VC locked', text: 'no one can join' },
        unlock: { connect: true, title: '🔊 VC unlocked', text: 'everyone can join again' },
        hide: { view: false, title: '🙈 VC hidden', text: 'hidden from @everyone' },
        show: { view: true, title: '👁️ VC shown', text: 'visible to @everyone again' },
      }[sub];
      try {
        await channel.permissionOverwrites.edit(interaction.guild.id, spec.connect !== undefined ? { Connect: spec.connect } : { ViewChannel: spec.view }, { reason: `VC ${sub} by ${interaction.user.tag}` });
        return reply(interaction, { embeds: [successEmbed({ title: spec.title, description: `<#${channel.id}> — ${spec.text}.` })] });
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
      }
    }
  },
};