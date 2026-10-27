/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Voice connection helper for 24/7 mode.
 * Integrates with DisTube voice manager when available to prevent VOICE_ALREADY_CREATED collisions.
 */
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');

function waitForReady(connection, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (connection.state?.status === VoiceConnectionStatus.Ready) return resolve();
    const timer = setTimeout(() => reject(new Error('Timed out connecting to voice')), timeoutMs);
    const onChange = () => {
      if (connection.state?.status === VoiceConnectionStatus.Ready) {
        clearTimeout(timer);
        connection.off('stateChange', onChange);
        resolve();
      }
    };
    connection.on('stateChange', onChange);
  });
}

/**
 * Ensure the bot is voice-connected to `channelId` in `guild`.
 * Returns true once connected, false if there is no valid target channel.
 * Throws if the connection could not be established.
 */
async function connectToVoice(guild, channelId) {
  const me = guild?.members?.me;
  if (!me) return false;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return false;

  // Already connected to the target channel.
  if (me.voice?.channelId === channel.id) {
    await me.voice.setSelfDeaf(true).catch(() => {});
    return true;
  }

  // If DisTube is available, connect through DisTube's voice manager so music works seamlessly
  const client = guild.client;
  if (client?.distube?.voices) {
    try {
      await client.distube.voices.join(channel);
      await me.voice.setSelfDeaf(true).catch(() => {});
      return true;
    } catch (distubeErr) {
      console.warn(`[PeaceX] [voice247] DisTube voice join failed, falling back to @discordjs/voice: ${distubeErr.message}`);
    }
  }

  let connection = getVoiceConnection(guild.id);

  // Live @discordjs/voice connection -> just move it to the target channel.
  if (connection && connection.state?.status === VoiceConnectionStatus.Ready) {
    try {
      await me.voice.setChannel(channel.id, '24/7 mode');
      await me.voice.setSelfDeaf(true).catch(() => {});
      return true;
    } catch (err) {
      try { connection.destroy(); } catch {}
      connection = null;
    }
  } else if (connection) {
    // Stale/destroyed connection from a previous session/kick — clear it first.
    try { connection.destroy(); } catch {}
    connection = null;
  }

  // No usable connection — join the channel for real.
  const fresh = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  await waitForReady(fresh);
  return fresh.state?.status === VoiceConnectionStatus.Ready;
}

/** Disconnect the bot from voice and tear down its connection. */
function disconnectFromVoice(guild, reason = 'Disconnected') {
  if (!guild?.members?.me) return Promise.resolve();
  return guild.members.me.voice.disconnect(reason).catch(() => {});
}

function destroyConnection(guild) {
  try {
    const connection = getVoiceConnection(guild?.id);
    if (connection) connection.destroy();
  } catch {}
}

module.exports = { connectToVoice, disconnectFromVoice, destroyConnection };
