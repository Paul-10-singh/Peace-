/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { get } = require('./settings');
const { LOG_CATEGORIES, normalizeName } = require('./logPanel');

/**
 * Checks whether a channel is a dedicated text log channel.
 * Strictly excludes Voice and Stage channels.
 */
function isTextLogChannel(c) {
  if (!c) return false;
  // Never log to a Voice Channel (type 2) or Stage Channel (type 13)
  if (c.type === 2 || c.type === 13) return false;
  if (typeof c.isVoiceBased === 'function' && c.isVoiceBased()) return false;
  return typeof c.isTextBased === 'function' && c.isTextBased();
}

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
    else if (category === 'vc' || category === 'voice') channelId = config.vc || config.voice;
  }

  // Auto-detect fallback from text channel names if unconfigured
  if (!channelId && LOG_CATEGORIES[category]) {
    const cat = LOG_CATEGORIES[category];
    const channels = [...(guild.channels?.cache?.values() || [])].filter(isTextLogChannel);
    const found = channels.find((c) => {
      const norm = normalizeName(c.name);
      return cat.searchKeywords.some((kw) => norm.includes(kw));
    });
    if (found) channelId = found.id;
  }

  if (!channelId) return null;

  let channel = guild.channels.cache.get(channelId);
  if (!channel) channel = await guild.channels.fetch(channelId).catch(() => null);
  // Ensure the resolved channel is strictly a text channel, never a voice chat!
  if (!channel || !isTextLogChannel(channel)) return null;

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

module.exports = { getLogChannel, sendLog, isTextLogChannel };
