/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — SQLite persistence layer (better-sqlite3).
 *
 * Central store for everything the zero-trust engine persists:
 *   capability_grants  — scoped, TTL'd capability grants (Layer 1)
 *   behavior_events    — per-user behavioral time-series (Layer 2)
 *   behavior_baselines — Welford running statistics         (Layer 2)
 *   audit_ledger       — tamper-evident hash-chained logs   (Layer 6)
 *   merkle_roots       — Ed25519-signed daily anchors       (Layer 6)
 *   incidents/steps    — resumable playbook execution       (Layer 7)
 *   lockdown_snapshots — pre-lockdown permission state      (Layer 7)
 *   verdict_cache      — AI content verdicts (24h TTL)      (Layer 3)
 *   intel_urls/senders — threat-intel feeds + rep DB        (Layer 4)
 *   nexus_reports      — federated gban reports             (Layer 8)
 *   user_reputation    — 0..1 lifetime reputation scores    (Layer 8)
 *
 * Migrations are tracked in schema_migrations and run inside a transaction,
 * so a partially-applied migration can never leave the DB half-upgraded.
 */
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DEFAULT_DB = process.env.SECURITY_DB_PATH || path.join(DATA_DIR, 'security.db');

// Migration steps — append only. Never edit an applied step.
const MIGRATIONS = [
  // v1 — zero-trust capability grants (Layer 1)
  `
  CREATE TABLE IF NOT EXISTS capability_grants (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT    NOT NULL,
    principal    TEXT    NOT NULL,           -- user:<id> | role:<id>
    action       TEXT    NOT NULL,           -- e.g. ban, channel.delete, role.grant
    scope        TEXT    NOT NULL DEFAULT '*',
    token_hash   TEXT    NOT NULL,           -- sha256 of signed token
    reason       TEXT,
    granted_by   TEXT,
    expires_at   INTEGER NOT NULL,
    last_used    INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_grants_ttl      ON capability_grants(expires_at);
  CREATE INDEX IF NOT EXISTS idx_grants_principal ON capability_grants(guild_id, principal);
  CREATE INDEX IF NOT EXISTS idx_grants_action    ON capability_grants(guild_id, action);
  `,
  // v2 — behavioral baselines + events (Layer 2)
  `
  CREATE TABLE IF NOT EXISTS behavior_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT    NOT NULL,
    guild_id     TEXT    NOT NULL,
    action       TEXT    NOT NULL,
    target       TEXT,
    ts           INTEGER NOT NULL,
    metadata     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_behavior_lookup ON behavior_events(user_id, guild_id, ts);

  CREATE TABLE IF NOT EXISTS behavior_baselines (
    user_id     TEXT    NOT NULL,
    guild_id    TEXT    NOT NULL,
    metric      TEXT    NOT NULL,
    count       INTEGER NOT NULL,            -- running N (Welford)
    mean        REAL    NOT NULL DEFAULT 0,
    m2          REAL    NOT NULL DEFAULT 0,  -- squared diff accumulator
    window_ms   INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, guild_id, metric)
  );
  `,
  // v3 — tamper-evident audit ledger (Layer 6)
  `
  CREATE TABLE IF NOT EXISTS audit_ledger (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT,
    ts          INTEGER NOT NULL,
    actor       TEXT,
    action      TEXT    NOT NULL,
    target      TEXT,
    metadata    TEXT,
    prev_hash   TEXT    NOT NULL,
    hash        TEXT    NOT NULL,
    seq         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_guild ON audit_ledger(guild_id, ts);
  CREATE INDEX IF NOT EXISTS idx_ledger_actor ON audit_ledger(actor, ts);

  CREATE TABLE IF NOT EXISTS merkle_roots (
    day             INTEGER PRIMARY KEY,   -- YYYYMMDD
    root            TEXT    NOT NULL,
    signature       TEXT,
    public_key_hex  TEXT,
    entry_count     INTEGER NOT NULL,
    built_at        INTEGER NOT NULL
  );
  `,
  // v4 — incident playbooks + rollback snapshots (Layer 7)
  `
  CREATE TABLE IF NOT EXISTS incidents (
    id           TEXT    PRIMARY KEY,
    guild_id     TEXT    NOT NULL,
    type         TEXT    NOT NULL,
    state        TEXT    NOT NULL DEFAULT 'running',  -- running|done|rolled_back|failed
    playbook     TEXT    NOT NULL,
    params       TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    rollback     TEXT
  );

  CREATE TABLE IF NOT EXISTS incident_steps (
    incident_id TEXT   NOT NULL,
    step_index  INTEGER NOT NULL,
    name        TEXT   NOT NULL,
    status      TEXT   NOT NULL DEFAULT 'pending', -- pending|done|failed|skipped
    output      TEXT,
    at          INTEGER,
    PRIMARY KEY (incident_id, step_index)
  );

  CREATE TABLE IF NOT EXISTS lockdown_snapshots (
    guild_id   TEXT   NOT NULL,
    channel_id TEXT   NOT NULL,
    overwrite  TEXT   NOT NULL,  -- JSON of the pre-lockdown overwrite state
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
  );
  `,
  // v5 — AI verdict cache (Layer 3)
  `
  CREATE TABLE IF NOT EXISTS verdict_cache (
    content_hash TEXT    PRIMARY KEY,
    verdict      TEXT    NOT NULL,
    confidence   REAL    NOT NULL,
    reason       TEXT,
    indicators   TEXT,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_verdict_ttl ON verdict_cache(expires_at);
  `,
  // v6 — threat intel feeds (Layer 4)
  `
  CREATE TABLE IF NOT EXISTS intel_urls (
    url_hash  TEXT    PRIMARY KEY,
    url       TEXT    NOT NULL,
    host      TEXT    NOT NULL,
    source    TEXT    NOT NULL,
    category  TEXT,
    meta      TEXT,
    first_seen INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_intel_host ON intel_urls(host);

  CREATE TABLE IF NOT EXISTS intel_senders (
    sender_hash TEXT   NOT NULL,   -- sha256 of normalized message that triggered
    verdict     TEXT   NOT NULL,
    guild_id    TEXT,
    hits        INTEGER NOT NULL DEFAULT 1,
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL,
    PRIMARY KEY (sender_hash)
  );
  CREATE INDEX IF NOT EXISTS idx_senders_seen ON intel_senders(last_seen);
  `,
  // v7 — nexus federation + reputation (Layer 8)
  `
  CREATE TABLE IF NOT EXISTS nexus_reports (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT    NOT NULL,
    offense_hash TEXT    NOT NULL,            -- never message content
    verdict      TEXT    NOT NULL,
    guild_id     TEXT    NOT NULL,
    peer_id      TEXT    NOT NULL,
    signature    TEXT    NOT NULL,
    reported_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_nexus_user ON nexus_reports(user_id);

  CREATE TABLE IF NOT EXISTS user_reputation (
    user_id        TEXT    PRIMARY KEY,
    score          REAL    NOT NULL DEFAULT 1.0,  -- 0..1
    offense_count  INTEGER NOT NULL DEFAULT 0,
    last_decay_at  INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );
  `,
  // v8 — baseline fold bookkeeping (Layer 2)
  `
  CREATE TABLE IF NOT EXISTS behavior_meta (
    user_id         TEXT    NOT NULL,
    guild_id        TEXT    NOT NULL,
    folded_through  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, guild_id)
  );
  `,
];

/**
 * Open (create if missing) the security database and apply pending migrations.
 * Throws only if the DB file cannot be opened — the bot must not run blindly
 * without persistence.
 */
function openDatabase(dbPath = DEFAULT_DB) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );

  const apply = db.transaction(() => {
    for (let i = 0; i < MIGRATIONS.length; i += 1) {
      const version = i + 1;
      if (applied.has(version)) continue;
      db.exec(MIGRATIONS[i]);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, Date.now());
    }
  });
  apply();

  return db;
}

module.exports = { openDatabase, DEFAULT_DB, MIGRATIONS };