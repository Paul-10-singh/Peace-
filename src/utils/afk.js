/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'afk.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');

let cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function setAfk(userId, reason, dmNotify) {
  cache[userId] = {
    reason: reason || 'AFK',
    timestamp: Date.now(),
    dmNotify: dmNotify === true,
  };
  persist();
  return cache[userId];
}

function getAfk(userId) {
  return cache[userId] || null;
}

function isAfk(userId) {
  return Boolean(cache[userId]);
}

function clearAfk(userId) {
  if (!cache[userId]) return null;
  const entry = cache[userId];
  delete cache[userId];
  persist();
  return entry;
}

function setDmNotify(userId, dmNotify) {
  if (!cache[userId]) return false;
  cache[userId].dmNotify = dmNotify === true;
  persist();
  return true;
}

module.exports = { setAfk, getAfk, isAfk, clearAfk, setDmNotify };