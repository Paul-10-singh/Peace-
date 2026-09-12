/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'noprefix.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ users: [] }, null, 2), 'utf8');

let cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (!Array.isArray(cache.users)) cache.users = [];

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function getNoprefixUsers() {
  return cache.users;
}

function isNoprefix(userId) {
  return cache.users.includes(userId);
}

function addNoprefix(userId) {
  if (!cache.users.includes(userId)) {
    cache.users.push(userId);
    persist();
  }
  return isNoprefix(userId);
}

function removeNoprefix(userId) {
  cache.users = cache.users.filter((id) => id !== userId);
  persist();
  return !isNoprefix(userId);
}

module.exports = { getNoprefixUsers, isNoprefix, addNoprefix, removeNoprefix };