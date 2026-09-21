'use strict';
/* * Peace* -- * Discord Bot -- Developed by Smith.Code *
 * Counter module -- db.js (Deliverable 2)
 *
 * SQLite bootstrap + handle. OWNER of the connection only; store.js owns
 * every query. Require store.js (it re-exports `db`), never require both —
 * same boot contract as the ToD module's tod/db.js (mirrored verbatim):
 *
 * Boot contract (in this exact order):
 *   1. better-sqlite3 is a HARD dependency. Missing -> fail loud with
 *      install instructions and process.exit(1). No JSON fallback.
 *   2. PRAGMAs: journal_mode WAL -> synchronous NORMAL -> busy_timeout
 *      5000 -> foreign_keys ON, BEFORE any query (schema exec included).
 *   3. schema.sql applied idempotently (IF NOT EXISTS everywhere).
 *   4. REQUIRED_TABLES verified against sqlite_master; any missing table
 *      throws "Counter schema drift" so boot stops, not crawls.
 */

const fs = require('fs');
const path = require('path');

const pino = require('pino');
const log = pino({
  name: 'peace-counter',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'peace-counter', developedBy: 'Smith.Code' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Path override: tests set COUNTER_DB_PATH=':memory:' BEFORE requiring
// the store so they never touch the on-disk data/counter.db.
const DB_PATH = process.env.COUNTER_DB_PATH || path.join(DATA_DIR, 'counter.db');

// Exactly the Phase-1 contract tables. <<single source of truth>>
const REQUIRED_TABLES = [
  'counter_channels',
  'counter_history',
  'counter_stats',
];

function open(pathOverride) {
  // 1 - hard dependency, fail loud
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    log.error({ err: err.message }, 'better-sqlite3 required but missing');
    console.error(
      '\n* Counter needs better-sqlite3 - install it and restart:\n' +
        '    npm install better-sqlite3\n' +
        '  (if it still fails, rebuild for your Node ABI:\n' +
        '    npm rebuild better-sqlite3)\n'
    );
    process.exit(1);
  }

  const db = new Database(pathOverride || DB_PATH);

  // 2 - PRAGMAs, exact order, before any query
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  // 3 - schema, idempotent
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schemaSql);

  // 4 - drift guard
  const found = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN (" +
        REQUIRED_TABLES.map(() => '?').join(',') +
        ')'
    )
    .all(...REQUIRED_TABLES);
  const foundSet = new Set(found.map((r) => r.name));
  const missing = REQUIRED_TABLES.filter((t) => !foundSet.has(t));
  if (missing.length > 0) {
    log.error({ missing }, 'Counter schema drift - missing tables');
    throw new Error(
      `Counter schema drift: missing tables ${missing.join(', ')}`
    );
  }

  log.info({ path: DB_PATH }, 'counter.db ready (WAL)');
  return db;
}

module.exports = { open, DB_PATH, REQUIRED_TABLES };
