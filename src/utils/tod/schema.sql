-- Peace✘ -- Discord Bot -- Developed by Smith.Code
-- Truth or Dare module -- schema.sql (Deliverable 2)
--
-- Contract (Phase 1 lock, approved): EXACTLY these 6 tables, no more.
--   tod_guild_config     guild defaults + spicy gate
--   tod_sessions         lobby | active | ended + settings/summary snapshots
--   tod_players          roster (turns/truths/dares/skips/strikes/status)
--   tod_rounds           one row per player turn
--   tod_custom_prompts   guild-scoped custom prompts (R9 prompt manager)
--   tod_prompt_history   never repeat the same prompt twice in a row (R8)
--
-- Deliberately removed from the corrupt draft (must NOT come back):
--   tod_round_history, tod_prompt_usage, tod_builtin_prompts
--   -- none of these exist in mockup_tod.txt section 12. Built-in pack
--   -- content is static module data (driven by intensity), and R8 no-repeat
--   -- is enforced via tod_prompt_history, not via a used_at flag table.
--
-- Applied idempotently by db.js on every boot (IF NOT EXISTS everywhere).
-- Timestamps: epoch-ms INTEGERs (Date.now()).

CREATE TABLE IF NOT EXISTS tod_guild_config (
  guild_id            TEXT PRIMARY KEY,
  intensity           TEXT    NOT NULL DEFAULT 'pg13',
      -- 'pg' | 'pg13' | 'r'
  categories          TEXT    NOT NULL DEFAULT 'Funny,Deep,Weird',
      -- CSV of enabled categories
  join_window_s       INTEGER NOT NULL DEFAULT 60,
  turn_timer_s        INTEGER NOT NULL DEFAULT 30,
  truth_timer_s       INTEGER NOT NULL DEFAULT 120,
  dare_timer_s        INTEGER NOT NULL DEFAULT 300,
  skip_tokens         INTEGER NOT NULL DEFAULT 3,
  strikes_to_kick     INTEGER NOT NULL DEFAULT 3,
  max_players         INTEGER NOT NULL DEFAULT 20,
  spicy_enabled_at    INTEGER,
      -- epoch-ms when Spicy pack was turned on (24h gate; null = off)
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tod_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT    NOT NULL,
  channel_id    TEXT    NOT NULL,
  host_id       TEXT    NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  round_count   INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'lobby',
      -- 'lobby' | 'active' | 'ended'
  settings_json TEXT    NOT NULL,
      -- guild config snapshot at session start
  summary_json  TEXT
      -- per-player stats at end
);
CREATE INDEX IF NOT EXISTS idx_tod_sessions_guild
  ON tod_sessions(guild_id, started_at DESC);

CREATE TABLE IF NOT EXISTS tod_players (
  session_id    INTEGER NOT NULL,
  user_id       TEXT    NOT NULL,
  joined_at     INTEGER NOT NULL,
  turns         INTEGER NOT NULL DEFAULT 0,
  truths        INTEGER NOT NULL DEFAULT 0,
  dares         INTEGER NOT NULL DEFAULT 0,
  skips_used    INTEGER NOT NULL DEFAULT 0,
  strikes       INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'active',
      -- 'active' | 'spectator' | 'left'
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS tod_rounds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL,
  round_no     INTEGER NOT NULL,
  user_id      TEXT    NOT NULL,
  choice       TEXT,        -- 'truth' | 'dare' | NULL (timeout)
  prompt_text  TEXT,
  prompt_id    TEXT,        -- key/id of the prompt shown that round
  category     TEXT,
  intensity    TEXT,
  result       TEXT NOT NULL,
      -- 'done' | 'skip' | 'refuse' | 'timeout'
  started_at   INTEGER NOT NULL,
  resolved_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tod_rounds_session
  ON tod_rounds(session_id, round_no);

CREATE TABLE IF NOT EXISTS tod_custom_prompts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT    NOT NULL,
  kind       TEXT    NOT NULL,      -- 'truth' | 'dare'
  category   TEXT    NOT NULL,
  intensity  TEXT    NOT NULL,      -- 'pg' | 'pg13' | 'r'
  prompt     TEXT    NOT NULL,
  added_by   TEXT    NOT NULL,
  added_at   INTEGER NOT NULL,
  use_count  INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tod_custom_unique
  ON tod_custom_prompts(guild_id, kind, prompt);
CREATE INDEX IF NOT EXISTS idx_tod_custom_guild
  ON tod_custom_prompts(guild_id, kind);

CREATE TABLE IF NOT EXISTS tod_prompt_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL,
  round_no    INTEGER NOT NULL,
  prompt_key  TEXT    NOT NULL,     -- key/id of the prompt used that round
  used_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tod_prompt_history_session
  ON tod_prompt_history(session_id, round_no DESC);
