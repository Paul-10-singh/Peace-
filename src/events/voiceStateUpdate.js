/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Temporary voice channels: when a member joins the configured "creation"
 * channel (/setup_tempvc), create a private temp VC named after them, move
 * them in, and delete the temp VC once it becomes empty. Guarded so bots,
 * channel deletions and permission failures never crash the listener.
 */
const { get } = require('../utils/settings');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { saveRoom, removeRoom, panelPayload } = require('../utils/tempvcPanel');

const cleaning = new Set();

async function handleVoiceState(client, oldState, newState) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const { channelId } = get(guild.id, 'tempvc');
  if (!channelId) return;

  const member = newState.member;
  if (member?.user.bot) return;

  // 1. Member joined the creation channel -> spawn a temp VC for them.
  if (newState.channelId === channelId && oldState.channelId !== channelId) {
    const creationChannel = guild.channels.cache.get(channelId);
    if (!creationChannel) return;

    try {
      const name = `🔊${member.user.username}'s VC`.slice(0, 32);
      const created = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: creationChannel.parentId || undefined,
        position: Math.max(0, creationChannel.position - 1),
        permissionOverwrites: [
          // Inherit the creation channel's base permissions, then lock to
          // creator + a standard role or @everyone with view.
          ...creationChannel.permissionOverwrites.cache.map((p) => ({
            id: p.id,
            allow: p.allow,
            deny: p.deny,
          })),
        ],
      });
      const botId = guild.members.me?.id;
      const chat = await guild.channels.create({
        name: `💬-${member.user.username}-room`.slice(0, 32),
        type: ChannelType.GuildText,
        parent: creationChannel.parentId || undefined,
        permissionOverwrites: [
          { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ...(botId ? [{ id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }] : []),
        ],
      });
      saveRoom(guild.id, created.id, { ownerId: member.id, chatId: chat.id, createdAt: Date.now() });
      await chat.send(panelPayload(created, member.id)).catch(() => {});
      await member.voice.setChannel(created).catch(() => null);
    } catch (err) {
      console.error(`[PeaceX] [TempVC] Could not spawn temp channel for ${member.user.tag}:`, err.message);
    }
    return;
  }

  // 2. Temp VC became empty -> delete it (moves to channelId null or another
  //    channel are fine; deletion is guarded against the bot itself).
  if (oldState.channelId && newState.channelId !== oldState.channelId) {
    const oldChannel = guild.channels.cache.get(oldState.channelId);
    if (oldChannel && oldChannel.name.startsWith('🔊') && oldChannel.members.size === 0) {
      if (cleaning.has(oldChannel.id)) return;
      cleaning.add(oldChannel.id);
      setTimeout(async () => {
        try {
          if (oldChannel.members.size === 0) {
            const room = get(guild.id, 'tempvc').rooms?.[oldChannel.id];
            if (room?.chatId) await guild.channels.cache.get(room.chatId)?.delete('Temp VC panel cleanup').catch(() => null);
            removeRoom(guild.id, oldChannel.id);
            await oldChannel.delete('Temp VC idle').catch(() => null);
          }
        } finally {
          cleaning.delete(oldChannel.id);
        }
      }, 1500);
    }
  }
}

module.exports = {
  name: 'tempvc',
  events: {
    voiceStateUpdate: handleVoiceState,
  },
};