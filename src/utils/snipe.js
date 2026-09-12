/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */

// In-memory cache of the most recently deleted messages per channel.
const cache = new Map();
const MAX_PER_CHANNEL = 10;

function capture(message) {
  if (!message.guild || !message.channel?.id) return;
  if (message.author?.bot) return;

  const entry = {
    content: message.content || null,
    authorTag: message.author.tag,
    authorId: message.author.id,
    avatar: message.author.displayAvatarURL({ size: 128 }),
    attachment: message.attachments?.first()?.url || null,
    embeds: message.embeds?.length ? message.embeds.length : 0,
    deletedAt: Date.now(),
  };

  const channelCache = cache.get(message.channel.id) || [];
  channelCache.push(entry);
  if (channelCache.length > MAX_PER_CHANNEL) channelCache.shift();
  cache.set(message.channel.id, channelCache);
}

function get(channelId, index = 0) {
  const channelCache = cache.get(channelId) || [];
  if (index < 0 || index >= channelCache.length) return null;
  return channelCache[channelCache.length - 1 - index];
}

function count(channelId) {
  return (cache.get(channelId) || []).length;
}

module.exports = { capture, get, count };
