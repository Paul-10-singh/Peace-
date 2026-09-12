/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Persistent per-server playlist storage (data/playlists.json).
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'playlists.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');

let cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function guildStore(guildId) {
  if (!cache[guildId]) cache[guildId] = {};
  return cache[guildId];
}

function list(guildId) {
  return Object.values(guildStore(guildId));
}

function get(guildId, name) {
  return guildStore(guildId)[name] || null;
}

function create(guildId, name, tracks = []) {
  const store = guildStore(guildId);
  if (store[name]) return { ok: false, error: 'exists' };
  store[name] = { name, created: Date.now(), tracks: tracks.slice(0, 500) };
  persist();
  return { ok: true, playlist: store[name] };
}

function addTracks(guildId, name, tracks) {
  const store = guildStore(guildId);
  if (!store[name]) return { ok: false, error: 'missing' };
  store[name].tracks = [...store[name].tracks, ...tracks.slice(0, 500)].slice(0, 500);
  persist();
  return { ok: true, playlist: store[name] };
}

function remove(guildId, name) {
  const store = guildStore(guildId);
  if (!store[name]) return false;
  delete store[name];
  persist();
  return true;
}

module.exports = { list, get, create, addTracks, remove };
