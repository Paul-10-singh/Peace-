/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Centralized Multi-Tier Owner & Permission System
 *   - Global Bot Owner: Bot creator/developer from .env (OWNER_ID / OWNER_IDS) or store.extra.
 *     Has 100% full access across all servers and DMs.
 *   - Server Owner: The Discord server owner (guild.ownerId).
 *     Automatically has default owner access ONLY in their own server.
 *     In other servers, they are a normal member.
 *   - Guild Extra Owners: Added via /extraowner add <user>.
 *     Have owner access ONLY in that specific guild.
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

// Reference to discord.js Client (set on bot startup)
let discordClient = null;
function setClient(client) {
  discordClient = client;
}

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

/**
 * Returns all Global Bot Owner IDs (from .env OWNER_ID / OWNER_IDS and store.extra).
 * Global Bot Owners have unrestricted access everywhere in all servers and DMs.
 */
function getBotOwnerIds() {
  const ids = [];
  const raw = String(process.env.OWNER_ID || process.env.OWNER_IDS || '');
  for (const part of raw.split(/[,;\s]+/)) {
    const trimmed = part.trim();
    if (/^\d+$/.test(trimmed)) ids.push(trimmed);
  }
  if (Array.isArray(store.extra)) {
    for (const id of store.extra) {
      if (/^\d+$/.test(String(id))) ids.push(String(id));
    }
  }
  return [...new Set(ids)];
}

/**
 * Checks if a user is a Global Bot Owner (Bot Developer / Creator).
 */
function isBotOwner(userId) {
  if (!userId) return false;
  return getBotOwnerIds().includes(String(userId));
}

function mainOwnerId() {
  return getBotOwnerIds()[0] || null;
}

/**
 * Commands strictly reserved for the Global Bot Owner.
 * Server Owners (guild owners) NEVER have access to these commands.
 */
const BOT_OWNER_COMMANDS = new Set([
  'serverlist',
  'leaveserver',
  'setprofile',
  'backup',
  'clone',
  'mention',
  'noprefix',
  'refresh',
  'extraowner',
  'gbans',
]);

/**
 * Returns the effective owners list for a guild context.
 * Always includes Bot Owners.
 * If guild or guildId is provided, also includes:
 *   - The Discord server owner (guild.ownerId)
 *   - Any extra owners configured specifically for that guild
 */
function getOwners(guildId = null, guild = null) {
  sweepTemp();
  const list = [...getBotOwnerIds()];

  const g = guild || (guildId && discordClient?.guilds?.cache?.get(String(guildId)));
  const gid = String(guildId || g?.id || '');

  // 1. Default Discord Server Owner (guild.ownerId)
  if (g?.ownerId) {
    list.push(String(g.ownerId));
  }

  // 2. Per-guild extra / temp owners
  if (gid && store.guilds[gid]) {
    const gStore = store.guilds[gid];
    if (Array.isArray(gStore.extra)) list.push(...gStore.extra.map(String));
    if (gStore.temp && typeof gStore.temp === 'object') {
      list.push(...Object.keys(gStore.temp));
    }
  }

  return [...new Set(list)];
}

/**
 * Checks if a user is an owner.
 * - Global Bot Owners are ALWAYS owners everywhere.
 * - A Discord Server Owner (guild.ownerId) is an owner ONLY inside their own server.
 * - In other servers where they are not the owner, they return false (normal member).
 */
function isOwner(userId, guildId = null, guild = null) {
  if (!userId) return false;
  const uid = String(userId);

  // 1. Global Bot Owner has full access across all servers
  if (isBotOwner(uid)) return true;

  // 2. Guild-specific owner check
  const g = guild || (guildId && discordClient?.guilds?.cache?.get(String(guildId)));
  if (g && String(g.ownerId) === uid) {
    return true; // Default server owner access in this guild!
  }

  // 3. Per-guild extra owners
  const gid = String(guildId || g?.id || '');
  if (gid && store.guilds[gid]) {
    const gStore = store.guilds[gid];
    if (Array.isArray(gStore.extra) && gStore.extra.map(String).includes(uid)) return true;
    if (gStore.temp && typeof gStore.temp === 'object' && gStore.temp[uid]) {
      sweepTemp();
      return typeof gStore.temp[uid] === 'number';
    }
  }

  return false;
}

function addOwner(userId, guildId) {
  if (!guildId) return false;
  const gid = String(guildId);
  if (!store.guilds[gid]) store.guilds[gid] = { extra: [], temp: {} };
  if (!Array.isArray(store.guilds[gid].extra)) store.guilds[gid].extra = [];
  const uid = String(userId);
  if (!store.guilds[gid].extra.includes(uid)) {
    store.guilds[gid].extra.push(uid);
    persist();
  }
  return isOwner(uid, gid);
}

function removeOwner(userId, guildId) {
  if (!guildId) return;
  const gid = String(guildId);
  if (!store.guilds[gid]) return;
  const uid = String(userId);
  const gStore = store.guilds[gid];
  gStore.extra = Array.isArray(gStore.extra) ? gStore.extra.filter((id) => String(id) !== uid) : [];
  if (gStore.temp) delete gStore.temp[uid];
  persist();
}

function addTempOwner(userId, untilMs, guildId) {
  if (!guildId) return null;
  const gid = String(guildId);
  if (!store.guilds[gid]) store.guilds[gid] = { extra: [], temp: {} };
  if (!store.guilds[gid].temp || typeof store.guilds[gid].temp !== 'object') store.guilds[gid].temp = {};
  const uid = String(userId);
  store.guilds[gid].temp[uid] = untilMs;
  persist();
  return untilMs;
}

function getTempOwner(userId, guildId = null) {
  sweepTemp();
  const gid = guildId ? String(guildId) : null;
  const temp = gid ? store.guilds[gid]?.temp : null;
  const uid = String(userId);
  return temp && typeof temp[uid] === 'number' ? temp[uid] : null;
}

module.exports = {
  getOwners,
  isOwner,
  isBotOwner,
  BOT_OWNER_COMMANDS,
  setClient,
  getBotOwnerIds,
  addOwner,
  removeOwner,
  addTempOwner,
  getTempOwner,
  mainOwnerId,
};
