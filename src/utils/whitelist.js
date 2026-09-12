/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Guild-scoped whitelist ("trusted" users) - persistent storage for access control.
 *   - Stored in data/whitelist.json as { guilds: { guildId: [userId] } }.
 *   - Loaded synchronously at startup and FAILS CLOSED: if the file is missing
 *     it is created empty; if it is corrupt, the error is logged, the corrupt
 *     file is backed up, and the list starts empty (nobody is whitelisted).
 *   - All mutations are serialized through a promise queue so concurrent
 *     add/remove calls cannot corrupt the file. Writes are atomic
 *     (temp file + rename).
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'whitelist.json');

let guildIds = new Map();
let loadFailed = false;

// --- Startup load (sync, fail closed) -------------------------------------
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, '[]', 'utf8');
    fs.writeFileSync(FILE, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
    console.log('[PeaceX] ✓ Guild whitelist initialized - access denied until users are added via /trusted');
  } else {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(raw)) {
      // Legacy global lists are intentionally not migrated to any guild.
      guildIds = new Map();
      persist();
    } else if (!raw || typeof raw !== 'object' || !raw.guilds || typeof raw.guilds !== 'object') {
      throw new Error('root must be an object with guilds');
    } else {
      for (const [guildId, ids] of Object.entries(raw.guilds)) {
        if (Array.isArray(ids)) guildIds.set(guildId, new Set(ids.map(String).filter((id) => /^\d+$/.test(id))));
      }
    }
  }
} catch (err) {
  loadFailed = true;
  console.error(`[PeaceX] [×] Failed to load whitelist - FAILED CLOSED (deny all). ${err.message}`);
  if (fs.existsSync(FILE)) {
    const backup = `${FILE}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(FILE, backup);
      console.error(`[PeaceX] Corrupt whitelist backed up to ${backup}`);
    } catch (backupErr) {
      console.error('[PeaceX] Could not back up corrupt whitelist file:', backupErr.message);
    }
    try {
      fs.writeFileSync(FILE, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
    } catch (writeErr) {
      console.error('[PeaceX] Could not recreate whitelist file:', writeErr.message);
    }
  }
  guildIds = new Map();
}

// --- Async-safe mutation queue (serializes read-modify-write) --------------
let queue = Promise.resolve();

function enqueue(task) {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

function persist() {
  const tmp = `${FILE}.tmp`;
  const guilds = {};
  for (const [guildId, ids] of guildIds) guilds[guildId] = [...ids];
  fs.writeFileSync(tmp, JSON.stringify({ guilds }, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

// --- API -------------------------------------------------------------------
function isTrusted(userId, guildId) {
  return Boolean(guildId && guildIds.get(String(guildId))?.has(String(userId)));
}

function list(guildId) {
  return [...(guildIds.get(String(guildId)) || [])];
}

// Returns true if the startup load failed (list is empty / deny-all).
function isHealthy() {
  return !loadFailed;
}

function add(userId, guildId) {
  const id = String(userId);
  const key = String(guildId || '');
  if (!key) return Promise.resolve({ added: false, id });
  return enqueue(() => {
    if (!guildIds.has(key)) guildIds.set(key, new Set());
    const ids = guildIds.get(key);
    if (ids.has(id)) return { added: false, id };
    ids.add(id);
    persist();
    return { added: true, id };
  });
}

function remove(userId, guildId) {
  const id = String(userId);
  const key = String(guildId || '');
  if (!key) return Promise.resolve({ removed: false, id });
  return enqueue(() => {
    const ids = guildIds.get(key) || new Set();
    if (!ids.has(id)) return { removed: false, id };
    ids.delete(id);
    persist();
    return { removed: true, id };
  });
}

module.exports = { isTrusted, list, add, remove, isHealthy };
