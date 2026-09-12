/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'owners.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ extra: [] }, null, 2), 'utf8');

let store = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (!Array.isArray(store.extra)) store.extra = [];
if (!store.temp || typeof store.temp !== 'object') store.temp = {};
if (!store.guilds || typeof store.guilds !== 'object') store.guilds = {};

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2), 'utf8');
}

// Expire temporary owners whose duration has passed (checked on every read).
function sweepTemp(now = Date.now()) {
  let changed = false;
  for (const [id, until] of Object.entries(store.temp)) {
    if (typeof until !== 'number' || until <= now) {
      delete store.temp[id];
      changed = true;
    }
  }
  for (const guild of Object.values(store.guilds)) {
    if (!guild?.temp || typeof guild.temp !== 'object') continue;
    for (const [id, until] of Object.entries(guild.temp)) {
      if (typeof until !== 'number' || until <= now) {
        delete guild.temp[id];
        changed = true;
      }
    }
  }
  if (changed) persist();
}

// The main owner comes from .env; extra owners are stored per guild in data/owners.json.
function mainOwnerId() {
  return process.env.OWNER_ID || null;
}

function getOwners(guildId = null) {
  sweepTemp();
  const list = [];
  if (mainOwnerId()) list.push(mainOwnerId());
  if (guildId) {
    const guild = store.guilds[guildId] || {};
    if (Array.isArray(guild.extra)) list.push(...guild.extra);
    if (guild.temp && typeof guild.temp === 'object') {
      list.push(...Object.keys(guild.temp));
    }
  }
  return [...new Set(list)];
}

function isOwner(userId, guildId = null) {
  return getOwners(guildId).includes(userId);
}

function addOwner(userId, guildId) {
  if (!guildId) return false;
  if (!store.guilds[guildId]) store.guilds[guildId] = { extra: [], temp: {} };
  if (!Array.isArray(store.guilds[guildId].extra)) store.guilds[guildId].extra = [];
  if (!store.guilds[guildId].extra.includes(userId)) {
    store.guilds[guildId].extra.push(userId);
    persist();
  }
  return isOwner(userId, guildId);
}

function removeOwner(userId, guildId) {
  if (!guildId || !store.guilds[guildId]) return;
  const guild = store.guilds[guildId];
  guild.extra = Array.isArray(guild.extra) ? guild.extra.filter((id) => id !== userId) : [];
  if (guild.temp) delete guild.temp[userId];
  persist();
}

// Grant temporary owner status until the given epoch ms; returns expiry time.
function addTempOwner(userId, untilMs, guildId) {
  if (!guildId) return null;
  if (!store.guilds[guildId]) store.guilds[guildId] = { extra: [], temp: {} };
  if (!store.guilds[guildId].temp || typeof store.guilds[guildId].temp !== 'object') store.guilds[guildId].temp = {};
  store.guilds[guildId].temp[userId] = untilMs;
  persist();
  return untilMs;
}

function getTempOwner(userId, guildId = null) {
  sweepTemp();
  const temp = guildId ? store.guilds[guildId]?.temp : null;
  return temp && typeof temp[userId] === 'number' ? temp[userId] : null;
}

module.exports = { getOwners, isOwner, addOwner, removeOwner, addTempOwner, getTempOwner, mainOwnerId };