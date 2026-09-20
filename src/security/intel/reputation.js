/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 4 : SENDER-REPUTATION DATABASE.
 *
 * Tracks hashes of every message that triggered enforcement. Repeated
 * payloads (same normalized text hash) across guilds surface quickly and
 * feed the nexus offense feed without ever storing message content.
 */
const { contentHash } = require('../crypto');

let DB = null;

function init(db) { DB = db; return reputationApi; }

/** Record that a normalized message hash caused enforcement. */
function recordSender(hashOrText, verdict, guildId = null) {
  if (!DB) return null;
  const hash = hashOrText?.length === 64 ? hashOrText : contentHash(hashOrText || '');
  const now = Date.now();
  DB.prepare(`
    INSERT INTO intel_senders (sender_hash, verdict, guild_id, hits, first_seen, last_seen)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(sender_hash) DO UPDATE SET
      hits = hits + 1, last_seen = excluded.last_seen
  `).run(hash, verdict || 'enforcement', guildId, now, now);
  return hash;
}

/** Lookup enforcement history for a message/text. */
function lookup(textOrHash) {
  if (!DB) return null;
  const hash = textOrHash?.length === 64 ? textOrHash : contentHash(textOrHash || '');
  return DB.prepare('SELECT * FROM intel_senders WHERE sender_hash = ?').get(hash) || null;
}

function recent(limit = 25) {
  return DB ? DB.prepare('SELECT * FROM intel_senders ORDER BY last_seen DESC LIMIT ?').all(limit) : [];
}

function stats() {
  return DB ? DB.prepare('SELECT COUNT(*) AS c FROM intel_senders').get().c : 0;
}

function disable() { /* table remains; nothing to unwind */ }

const reputationApi = { init, recordSender, lookup, recent, stats, disable };

module.exports = reputationApi;