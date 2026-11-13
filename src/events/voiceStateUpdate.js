/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Temporary voice channels & VC audit logger.
 * Captures VC Join, Left, Switched/Moved, Disconnected, Server Muted/Unmuted, Server Deafened/Undeafened.
 * Spawns private temp VC upon joining the setup channel and automatically deletes when empty.
 */
const { get } = require('../utils/settings');
const { PermissionFlagsBits, ChannelType, AuditLogEvent } = require('discord.js');
const { saveRoom, removeRoom, panelPayload } = require('../utils/tempvcPanel');

const cleaning = new Set();

async function logVoiceEvent(client, oldState, newState) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;
  const member = newState.member || oldState.member;
  if (!member || member.user?.bot) return;

  const { sendLog } = require('../utils/logging');
  const { buildVoiceLog } = require('../utils/logFormatter');

  let action = null;
  let channel = newState.channel || oldState.channel;
  let oldChannel = oldState.channel;
  let executor = null;

  const canAudit = Boolean(guild.members?.me?.permissions?.has(PermissionFlagsBits.ViewAuditLog));

  // 1. Joined Voice Channel
  if (!oldState.channelId && newState.channelId) {
    action = 'Joined Voice Channel';
    channel = newState.channel;
  }
  // 2. Left / Disconnected from Voice Channel
  else if (oldState.channelId && !newState.channelId) {
    action = 'Left Voice Channel';
    channel = oldState.channel;

    if (canAudit) {
      try {
        const audit = await guild.fetchAuditLogs({
          type: AuditLogEvent.MemberDisconnect,
          limit: 1,
        });
        const entry = audit?.entries?.first();
        if (entry && Date.now() - entry.createdTimestamp < 4000) {
          action = 'Voice Disconnected';
          executor = entry.executor;
        }
      } catch {}
    }
  }
  // 3. Switched / Moved Voice Channel
  else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    action = 'Switched Voice Channel';
    channel = newState.channel;
    oldChannel = oldState.channel;

    if (canAudit) {
      try {
        const audit = await guild.fetchAuditLogs({
          type: AuditLogEvent.MemberMove,
          limit: 1,
        });
        const entry = audit?.entries?.first();
        if (entry && Date.now() - entry.createdTimestamp < 4000) {
          action = 'Moved Voice Channel';
          executor = entry.executor;
        }
      } catch {}
    }
  }
  // 4. Server Mute / Unmute
  else if (oldState.serverMute !== newState.serverMute) {
    action = newState.serverMute ? 'Server Muted' : 'Server Unmuted';
    channel = newState.channel;

    if (canAudit) {
      try {
        const audit = await guild.fetchAuditLogs({
          type: AuditLogEvent.MemberUpdate,
          limit: 1,
        });
        const entry = audit?.entries?.first();
        if (
          entry &&
          entry.target?.id === member.id &&
          Date.now() - entry.createdTimestamp < 4000 &&
          entry.changes?.some((c) => c.key === 'mute')
        ) {
          executor = entry.executor;
        }
      } catch {}
    }
  }
  // 5. Server Deafen / Undeafen
  else if (oldState.serverDeaf !== newState.serverDeaf) {
    action = newState.serverDeaf ? 'Server Deafened' : 'Server Undeafened';
    channel = newState.channel;

    if (canAudit) {
      try {
        const audit = await guild.fetchAuditLogs({
          type: AuditLogEvent.MemberUpdate,
          limit: 1,
        });
        const entry = audit?.entries?.first();
        if (
          entry &&
          entry.target?.id === member.id &&
          Date.now() - entry.createdTimestamp < 4000 &&
          entry.changes?.some((c) => c.key === 'deaf')
        ) {
          executor = entry.executor;
        }
      } catch {}
    }
  }

  if (action) {
    const embed = buildVoiceLog({
      member,
      action,
      channel,
      oldChannel,
      executor,
    });

    await sendLog(client, guild.id, 'vc', { embeds: [embed] }).catch(() => {});
  }
}

async function handleVoiceState(client, oldState, newState) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  await logVoiceEvent(client, oldState, newState).catch(() => {});

  const { channelId } = get(guild.id, 'tempvc');
  if (!channelId) return;

  const member = newState.member;
  if (member?.user?.bot) return;

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
        permissionOverwrites: [
          ...creationChannel.permissionOverwrites.cache.map((p) => ({
            id: p.id,
            allow: p.allow,
            deny: p.deny,
          })),
          { 
            id: guild.id, 
            allow: [
              PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream, 
              PermissionFlagsBits.UseSoundboard, PermissionFlagsBits.UseExternalSounds, PermissionFlagsBits.UseVAD,
              PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, 
              PermissionFlagsBits.AddReactions, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.UseExternalStickers,
              PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendTTSMessages, PermissionFlagsBits.SendVoiceMessages
            ] 
          },
          { 
            id: member.id, 
            allow: [
              PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.MoveMembers
            ] 
          }
        ],
      });
      
      // Ensure it goes below the setup channel
      await created.setPosition(creationChannel.position + 1).catch(() => {});
      
      saveRoom(guild.id, created.id, { ownerId: member.id, chatId: created.id, createdAt: Date.now() });
      await created.send(panelPayload(created, member.id)).catch(() => {});
      await member.voice.setChannel(created).catch(() => null);
    } catch (err) {
      console.error(`[PeaceX] [TempVC] Could not spawn temp channel for ${member.user?.tag || member.user?.username}:`, err.message);
    }
    return;
  }

  // 2. Temp VC became empty -> delete it (moves to channelId null or another
  //    channel are fine; deletion is guarded against the bot itself).
  if (oldState.channelId && newState.channelId !== oldState.channelId) {
    const oldChannel = guild.channels.cache.get(oldState.channelId);
    if (oldChannel && oldChannel.members?.size === 0) {
      const room = get(guild.id, 'tempvc').rooms?.[oldChannel.id];
      if (room) {
        if (cleaning.has(oldChannel.id)) return;
        cleaning.add(oldChannel.id);
        try {
          if (oldChannel.members?.size === 0) {
            const currentRoom = get(guild.id, 'tempvc').rooms?.[oldChannel.id];
            if (currentRoom?.chatId && currentRoom.chatId !== oldChannel.id) {
              await guild.channels.cache.get(currentRoom.chatId)?.delete('Temp VC panel cleanup').catch(() => null);
            }
            removeRoom(guild.id, oldChannel.id);
            await oldChannel.delete('Temp VC idle').catch(() => null);
          }
        } finally {
          cleaning.delete(oldChannel.id);
        }
      }
    }
  }
}

module.exports = {
  name: 'tempvc',
  events: {
    voiceStateUpdate: handleVoiceState,
  },
};
