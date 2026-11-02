/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { get } = require('./settings');
const { LOG_CATEGORIES, normalizeName } = require('./logPanel');

async function getLogChannel(client, guildId, category) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return null;

  const config = get(guildId, 'logs') || {};
  let channelId = config[category];

  // Alias fallbacks for backwards compatibility
  if (!channelId) {
    if (category === 'moderation') channelId = config.ban || config.automod || config.moderation;
    else if (category === 'welcome') channelId = config.entry || config.welcome || config.invite;
    else if (category === 'goodbye') channelId = config.exit || config.goodbye;
    else if (category === 'utility') channelId = config.server || config.channel || config.utility;
    else if (category === 'invite') channelId = config.invite || config.entry;
  }

  // Auto-detect fallback from channel names if unconfigured
  if (!channelId && LOG_CATEGORIES[category]) {
    const cat = LOG_CATEGORIES[category];
    const channels = [...(guild.channels?.cache?.values() || [])].filter((c) => c.isTextBased?.() || c.type === 0);
    const found = channels.find((c) => {
      const norm = normalizeName(c.name);
      return cat.searchKeywords.some((kw) => norm.includes(kw));
    });
    if (found) channelId = found.id;
  }

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
