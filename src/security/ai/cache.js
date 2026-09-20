/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 3 : AI VERDICT CACHE.
 *
 * Verdicts are cached by content hash (SHA-256 of normalized text) with a
 * 24h TTL so identical spam/scam payloads cost one inference, not thousands.
 */
const { contentHash } = require('../crypto');

let DB = null;

function init(db) { DB = db; return verdictCache; }

const getRow = () => DB.prepare('SELECT * FROM verdict_cache WHERE content_hash = ?');
const insertRow = () => DB.prepare(
  `INSERT OR REPLACE INTO verdict_cache (content_hash, verdict, confidence, reason, indicators, created_at, expires_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const sweep = () => DB.prepare('DELETE FROM verdict_cache WHERE expires_at <= ?');

/** Lookup a verdict; returns row or null. Sweeps expired rows lazily. */
function get(text, { now = Date.now() } = {}) {
  if (!DB) return null;
  sweep().run(now);
  return getRow().get(contentHash(text)) || null;
}

/**
 * Store a verdict for normalized text. TTL defaults to 24h.
 * Returns the stored row.
 */
function set(text, verdict, confidence, reason = null, indicators = [], ttlMs = 24 * 60 * 60 * 1000, { now = Date.now() } = {}) {
  if (!DB) return null;
  const hash = contentHash(text);
  insertRow().run(hash, verdict, confidence, reason, JSON.stringify(indicators || []), now, now + ttlMs);
  return getRow().get(hash);
}

function size() {
  return DB ? DB.prepare('SELECT COUNT(*) AS c FROM verdict_cache').get().c : 0;
}

function disable() {
  if (DB) sweep().run(Date.now());
}

const verdictCache = { init, get, set, size, disable, contentHash };

module.exports = verdictCache;