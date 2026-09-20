/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 6 : TAMPER-EVIDENT AUDIT LEDGER.
 *
 * Append-only hash-chained log. Every entry stores
 *   sha256(prev_hash + canonical(entry_data))
 * so modifying, deleting or reordering ANY row breaks the chain and is
 * detectable by /audit verify (or engine.ledger.verify()).
 *
 * Each entry row records: id(seq), guild_id, ts, actor, action, target,
 * metadata, prev_hash, hash.
 */
const { sha256, canonical } = require('../crypto');

const GENESIS = '0'.repeat(64);

let DB = null;

function init(db) { DB = db; return chainApi; }

function lastEntry() {
  if (!DB) return null;
  return DB.prepare('SELECT * FROM audit_ledger ORDER BY seq DESC LIMIT 1').get() || null;
}

function nextSeq() {
  const row = DB ? DB.prepare('SELECT COALESCE(MAX(seq),0) AS m FROM audit_ledger').get() : null;
  return (row?.m || 0) + 1;
}

/** Canonical serialization of one entry's data fields (excluding chain fields). */
function entryData({ guildId, ts, actor, action, target, metadata }) {
  return canonical([guildId || null, ts, actor || null, action, target || null, metadata || {}]);
}

/**
 * Append a new entry. Returns the created row { seq, prev_hash, hash }.
 * Chain fields are computed deterministically so verification is exact.
 */
function append(guildId, actor, action, target, metadata = {}, ts = Date.now()) {
  if (!DB) return null;
  const prev = lastEntry();
  const seq = nextSeq();
  const data = entryData({ guildId, ts, actor, action, target, metadata });
  const prevHash = prev ? prev.hash : GENESIS;
  const hash = sha256(prevHash + data);

  DB.prepare(`
    INSERT INTO audit_ledger (guild_id, ts, actor, action, target, metadata, prev_hash, hash, seq)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, ts, actor, action, target, JSON.stringify(metadata || {}), prevHash, hash, seq);

  return { seq, prev_hash: prevHash, hash, ts };
}

/**
 * Verify the chain. Two failure modes are detected:
 *   - broken prev-link  (previous entry's stored hash changed)
 *   - broken hash       (this entry's data was altered)
 * Returns { ok, entries, gap } where gap is the first broken entry row or null.
 */
function verify(guildId = null, { fromSeq = 1 } = {}) {
  if (!DB) return { ok: true, entries: 0, gap: null };
  const rows = guildId
    ? DB.prepare('SELECT * FROM audit_ledger WHERE guild_id = ? AND seq >= ? ORDER BY seq ASC').all(guildId, fromSeq)
    : DB.prepare('SELECT * FROM audit_ledger WHERE seq >= ? ORDER BY seq ASC').all(fromSeq);

  let prevHash = GENESIS;
  if (fromSeq > 1) {
    const before = DB.prepare('SELECT * FROM audit_ledger WHERE seq < ? ORDER BY seq DESC LIMIT 1').get(fromSeq);
    if (before) prevHash = before.hash;
  }

  for (const row of rows) {
    if (row.prev_hash !== prevHash) {
      return { ok: false, entries: rows.length, gap: { ...row, flaw: 'prev-link' } };
    }
    const data = entryData({
      guildId: row.guild_id, ts: row.ts, actor: row.actor,
      action: row.action, target: row.target, metadata: safeJson(row.metadata),
    });
    const expected = sha256(prevHash + data);
    if (expected !== row.hash) {
      return { ok: false, entries: rows.length, gap: { ...row, flaw: 'hash' } };
    }
    prevHash = row.hash;
  }
  return { ok: true, entries: rows.length, gap: null };
}

function safeJson(raw) {
  try { return JSON.parse(raw || 'null') || {}; } catch { return {}; }
}

/** Total entry count. */
function count() {
  return DB ? DB.prepare('SELECT COUNT(*) AS c FROM audit_ledger').get().c : 0;
}

/** Query entries (optional guild + actor + action filters). */
function query({ guildId, actor, action, limit = 50 }) {
  if (!DB) return [];
  const clauses = [];
  const binds = [];
  if (guildId) { clauses.push('guild_id = ?'); binds.push(guildId); }
  if (actor) { clauses.push('actor = ?'); binds.push(actor); }
  if (action) { clauses.push('action = ?'); binds.push(action); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return DB.prepare(`SELECT * FROM audit_ledger ${where} ORDER BY seq DESC LIMIT ?`).all(...binds, limit);
}

const chainApi = { init, append, verify, count, query, lastEntry, nextSeq, entryData, GENESIS };

module.exports = chainApi;