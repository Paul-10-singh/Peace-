/*
 * Peace* -- Discord Bot - Developed by Smith.Code
 * Truth or Dare module - db.js (Deliverable 2 / part B)
 *
 * SQLite bootstrap + handle. OWNER of the connection only; store.js owns
 * every query. Require store.js (it re-exports `db`), never require both.
 *
 * Boot contract (in this exact order):
 *   1. better-sqlite3 is a HARD dependency. Missing -> fail loud with
 *      install instructions and process.exit(1). No JSON fallback: ToD
 *      state is transactional and a degraded data layer is worse than a
 *      loud boot.
 *   2. PRAGMAs: journal_mode WAL -> synchronous NORMAL -> busy_timeout 5000
 *      -> foreign_keys ON, BEFORE any query (schema exec included).
 *   3. schema.sql applied idempotently (IF NOT EXISTS everywhere).
 *   4. REQUIRED_TABLES verified against sqlite_master; any missing table
 *      throws "ToD schema drift" so boot stops, not crawls.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const pino = require('pino');
const log = pino({
  name: 'peace-tod',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'peace-tod', developedBy: 'Smith.Code' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Path override: tests set TOD_DB_PATH=':memory:' BEFORE requiring the
// store so they never touch the on-disk data/tod.db. An explicit
// pathOverride to open() wins over the env var.
const DB_PATH = process.env.TOD_DB_PATH || path.join(DATA_DIR, 'tod.db');

// Exactly the Phase-1 contract tables. <<single source of truth>>
const REQUIRED_TABLES = [
  'tod_guild_config',
  'tod_sessions',
  'tod_players',
  'tod_rounds',
  'tod_custom_prompts',
  'tod_prompt_history',
];

function open(pathOverride) {
  // 1 - hard dependency, fail loud
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    log.error({ err: err.message }, 'better-sqlite3 required but missing');
    console.error(
      '\n* Truth or Dare needs better-sqlite3 - install it and restart:\n' +
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
    log.error({ missing }, 'ToD schema drift - missing tables');
    throw new Error(`ToD schema drift: missing tables ${missing.join(', ')}`);
  }

  log.info({ path: DB_PATH }, 'tod.db ready (WAL)');
  return db;
}

module.exports = { open, DB_PATH, REQUIRED_TABLES };