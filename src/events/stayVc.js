/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * 24/7 voice: enforces the channel configured via /vc247. The bot rejoins it
 * on startup, when kicked, moved or disconnected, and stays even when the
 * channel becomes empty. Cleanup happens when the configured channel itself
 * is deleted.
 */
const { ChannelType } = require('discord.js');
const { get, set } = require('../utils/settings');
const { connectToVoice } = require('../utils/voice247');

const pending = new Map(); // guildId -> timer handle (coalesce rapid re-entries)
const REJOIN_DELAY = 2000; // ms to wait before rejoining after a kick/move

async function getTarget(client, guild) {
  const { channelId } = get(guild.id, 'vc247') || {};
  if (!channelId) return null;
  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    try {
      channel = await guild.channels.fetch(channelId);
    } catch {
      return null;
    }
  }
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;
  return channel;
}

async function ensureConnected(client, guild) {
  const me = guild?.members?.me;
  const target = await getTarget(client, guild).catch(() => null);
  if (!me || !target) return;
  try {
    if (me.voice.channelId === target.id) return;
    await connectToVoice(guild, target.id);
    console.log(`[PeaceX] [24/7] Joined <#${target.id}> in "${guild.name}".`);
  } catch (err) {
    console.error(`[PeaceX] [24/7] Could not join voice in "${guild.name}":`, err.message);
  }
}

function scheduleRejoin(client, guild) {
  if (pending.has(guild.id)) clearTimeout(pending.get(guild.id));
  const timer = setTimeout(() => {
    pending.delete(guild.id);
    ensureConnected(client, guild);
  }, REJOIN_DELAY);
  pending.set(guild.id, timer);
}

async function onClientReady(client) {
  // Wait a moment for guilds / channels to finish caching.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  for (const guild of client.guilds.cache.values()) {
    const { channelId } = get(guild.id, 'vc247') || {};
    if (channelId) scheduleRejoin(client, guild);
  }
}

function onVoiceStateUpdate(client, oldState, newState) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  // Only react to the bot's own voice state.
  const isSelf = (newState.member?.id === client.user.id) || (oldState.member?.id === client.user.id);
  if (!isSelf) return;

  const { channelId } = get(guild.id, 'vc247') || {};
  if (!channelId) return;

  // Kicked, moved or dropped out of the 24/7 channel -> go back.
  if (newState.channelId !== channelId) scheduleRejoin(client, guild);
}

async function onChannelDelete(client, channel) {
  if (channel?.type !== ChannelType.GuildVoice) return;
  const guildId = channel.guild?.id;
  if (!guildId) return;
  const { channelId } = get(guildId, 'vc247') || {};
  if (channel.id === channelId) {
    set(guildId, 'vc247', { channelId: null });
    console.log(`[PeaceX] [24/7] Channel <#${channel.id}> deleted — 24/7 disabled in "${channel.guild.name}".`);
  }
}

module.exports = {
  name: 'vc247',
  events: {
    clientReady: onClientReady,
    voiceStateUpdate: onVoiceStateUpdate,
    channelDelete: onChannelDelete,
  },
};