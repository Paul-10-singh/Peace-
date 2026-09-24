/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Keeps voice channel status persistent. When a user joins an empty voice channel,
 * this re-applies the permanent status if one is saved.
 */
const { get } = require('../utils/settings');

async function handleVoiceState(client, oldState, newState) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  // We only care about a user joining a channel (could be switching or joining from scratch)
  if (newState.channelId && newState.channelId !== oldState.channelId) {
    const channel = newState.channel;
    if (!channel) return;

    // Check if the channel was previously empty (now has 1 member)
    if (channel.members.size === 1) {
      const config = get(guild.id, 'vcstatus');
      if (config && config[channel.id]) {
        try {
          await client.rest.put(`/channels/${channel.id}/voice-status`, { body: { status: config[channel.id] } });
        } catch (err) {
          console.error(`[PeaceX] [VCStatus] Could not re-apply status for ${channel.id}:`, err.message);
        }
      }
    }
  }

  // We also care about a user leaving a channel, making it empty.
  // Discord auto-clears the status when the last person leaves. We need to re-apply it.
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const channel = oldState.channel;
    if (!channel) return;

    if (channel.members.size === 0) {
      const config = get(guild.id, 'vcstatus');
      if (config && config[channel.id]) {
        // Wait a second for Discord to clear it natively, then apply our permanent status
        setTimeout(async () => {
          try {
            await client.rest.put(`/channels/${channel.id}/voice-status`, { body: { status: config[channel.id] } });
          } catch (err) {
            console.error(`[PeaceX] [VCStatus] Could not re-apply status for empty ${channel.id}:`, err.message);
          }
        }, 1500);
      }
    }
  }
}

module.exports = {
  name: 'vcStatusKeeper',
  events: {
    voiceStateUpdate: handleVoiceState,
  },
};
