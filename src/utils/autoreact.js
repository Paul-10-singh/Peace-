/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Auto-reaction storage + runtime.
 * data/autoreact.json -> { [guildId]: { [channelId]: [emoji...] } }
 * Works for unicode emojis and custom emojis passed as <:name:id>.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'autoreact.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');

let cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function getGuild(guildId) {
  if (!cache[guildId] || typeof cache[guildId] !== 'object') cache[guildId] = {};
  return cache[guildId];
}

function getEmojis(guildId, channelId) {
  const channel = getGuild(guildId)[channelId];
  return Array.isArray(channel) ? channel : [];
}

function addEmoji(guildId, channelId, emoji) {
  const channels = getGuild(guildId);
  if (!Array.isArray(channels[channelId])) channels[channelId] = [];
  if (channels[channelId].includes(emoji)) return { added: false };
  channels[channelId].push(emoji);
  persist();
  return { added: true };
}

function removeEmoji(guildId, channelId, emoji) {
  const channels = getGuild(guildId);
  if (!Array.isArray(channels[channelId])) return { removed: false };
  const index = channels[channelId].indexOf(emoji);
  if (index === -1) return { removed: false };
  channels[channelId].splice(index, 1);
  if (channels[channelId].length === 0) delete channels[channelId];
  persist();
  return { removed: true };
}

function allConfig() {
  return cache;
}

async function tryReact(message) {
  if (message.author.bot || !message.guild) return;
  const emojis = getEmojis(message.guild.id, message.channel.id);
  if (!emojis.length) return;
  for (const emoji of emojis) {
    await message.react(emoji).catch(() => {});
  }
}

module.exports = { getEmojis, addEmoji, removeEmoji, allConfig, tryReact };
