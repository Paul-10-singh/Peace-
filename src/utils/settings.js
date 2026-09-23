/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'settings.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');

let cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const DEFAULTS = {
  welcome: { enabled: false, channelId: null, message: null, roleId: null },
  farewell: { enabled: false, channelId: null, message: null },
  security: {
    enabled: false,
    autoWarn: true,
    action: 'warn',
    warnThreshold: 3,
    whitelist: [],
    warns: {},
    antiSpam: { enabled: false, maxMessages: 5, intervalMs: 5000 },
    antiLink: { enabled: false, allow: [], blockScam: true },
    antiNuke: { enabled: false, punishment: 'ban', extraOwners: [], whitelistRoles: [], lockdown: true },
    words: [],
  },
  stats: { enabled: false, members: null, bots: null, category: null },
  profanity: { enabled: true, offenses: {} },
  autorole: { roleId: null },
  tempvc: { channelId: null, rooms: {} },
  vc247: { channelId: null },
  vcrole: { roleId: null },
  logs: {
    moderation: null,
    utility: null,
    security: null,
    welcome: null,
    goodbye: null,
    role: null,
    message: null,
    nickname: null,
    invite: null,
  },
  ignoredChannels: [],
  quarantine: { roleId: null, bypass: [], users: {} },
  reactionroles: [],
  verification: { roleId: null },
};

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function getGuild(guildId) {
  if (!cache[guildId]) cache[guildId] = {};
  return cache[guildId];
}

function get(guildId, key) {
  const base = JSON.parse(JSON.stringify(DEFAULTS[key] || {}));
  // Array defaults (e.g. reactionroles, ignoredChannels) must stay arrays —
  // object spread would silently turn them into { 0: ..., 1: ... }.
  if (Array.isArray(base)) return [...(getGuild(guildId)[key] || [])];
  return { ...base, ...(getGuild(guildId)[key] || {}) };
}

function set(guildId, key, value) {
  getGuild(guildId)[key] = JSON.parse(JSON.stringify(value));
  persist();
}

// Nested list helpers (e.g. key=security, list=whitelist|words)
function getList(guildId, key, list) {
  return get(guildId, key)[list] || [];
}

function addToList(guildId, key, list, value) {
  const data = get(guildId, key);
  if (!Array.isArray(data[list])) data[list] = [];
  if (!data[list].includes(value)) data[list].push(value);
  set(guildId, key, data);
}

function removeFromList(guildId, key, list, value) {
  const data = get(guildId, key);
  if (!Array.isArray(data[list])) return;
  data[list] = data[list].filter((v) => v !== value);
  set(guildId, key, data);
}

// Warning counters for auto-warn
function getWarns(guildId, userId) {
  const data = get(guildId, 'security');
  return data.warns?.[userId] || 0;
}

function addWarn(guildId, userId) {
  const data = get(guildId, 'security');
  if (!data.warns) data.warns = {};
  data.warns[userId] = (data.warns[userId] || 0) + 1;
  set(guildId, 'security', data);
  return data.warns[userId];
}

function clearWarns(guildId, userId) {
  const data = get(guildId, 'security');
  if (data.warns) delete data.warns[userId];
  set(guildId, 'security', data);
}

// Persistent offense counters for the escalating profanity timeout
// (mirrors the warn counter pattern above; survives restarts).
function getOffense(guildId, userId) {
  const data = get(guildId, 'profanity');
  return data.offenses?.[userId] || 0;
}

function addOffense(guildId, userId) {
  const data = get(guildId, 'profanity');
  if (!data.offenses) data.offenses = {};
  data.offenses[userId] = (data.offenses[userId] || 0) + 1;
  set(guildId, 'profanity', data);
  return data.offenses[userId];
}

function clearOffenses(guildId, userId) {
  const data = get(guildId, 'profanity');
  if (data.offenses) delete data.offenses[userId];
  set(guildId, 'profanity', data);
}

module.exports = { get, set, getList, addToList, removeFromList, getWarns, addWarn, clearWarns, getOffense, addOffense, clearOffenses, getGuild };