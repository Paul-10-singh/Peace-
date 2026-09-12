/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { get } = require('./settings');

async function getLogChannel(client, guildId, category) {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  const config = get(guildId, 'logs');
  const channelId = config?.[category];
  if (!channelId) return null;

  let channel = guild.channels.cache.get(channelId);
  if (!channel) channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;

  return channel;
}

async function sendLog(client, guildId, category, payload) {
  const channel = await getLogChannel(client, guildId, category);
  if (!channel) return null;

  try {
    return await channel.send(payload);
  } catch (err) {
    console.error(`[PeaceX] [Logs] Failed to send ${category} log for guild ${guildId}:`, err);
    return null;
  }
}

module.exports = { getLogChannel, sendLog };
