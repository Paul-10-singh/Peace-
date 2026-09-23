-- Peace* -- Discord Bot -- Developed by Smith.Code
-- Counter module -- schema.sql (Deliverable 2)
--
-- Contract (mockup_counter.txt, approved): EXACTLY these 3 tables, no more.
--   counter_channels   per-counting-channel config + live state
--   counter_history    append-only audit of every count/ruin/reset
--   counter_stats      per-channel rollups (best / counts / ruins)
--
-- Applied idempotently by db.js on boot (IF NOT EXISTS everywhere + CREATE
-- INDEX IF NOT EXISTS). Keep idempotent. Timestamps are epoch-ms.

CREATE TABLE IF NOT EXISTS counter_channels (
  channel_id        TEXT PRIMARY KEY,
  guild_id          TEXT NOT NULL,
  mode              TEXT NOT NULL DEFAULT 'numbers_only',
      -- 'numbers_only' | 'numbers_arithmetic'
  on_ruin           TEXT NOT NULL DEFAULT 'delete',
      -- 'delete' | 'react'
  on_success        TEXT NOT NULL DEFAULT 'react_number',
      -- 'react_number' | 'react_check' | 'none'
  same_user_guard   INTEGER NOT NULL DEFAULT 1,
  notify_previous   INTEGER NOT NULL DEFAULT 1,
  reset_behavior    TEXT NOT NULL DEFAULT 'to_zero',
      -- 'to_zero' | 'to_checkpoint'
  checkpoint_every  INTEGER NOT NULL DEFAULT 100,
      -- 100 | 500 | 0 (0 = never)
  current           INTEGER NOT NULL DEFAULT 0,
  last_counter_id   TEXT,
  best              INTEGER NOT NULL DEFAULT 0,
  resets            INTEGER NOT NULL DEFAULT 0,
  ruins             INTEGER NOT NULL DEFAULT 0,
  paused            INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_counter_guild ON counter_channels(guild_id);

CREATE TABLE IF NOT EXISTS counter_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id  TEXT NOT NULL,
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  number      INTEGER,            -- 0 on reset rows
  kind        TEXT NOT NULL,      -- 'count' | 'ruin' | 'res4'
      -- 'count' | 'ruin' | 'reset'
  reason      TEXT,               -- 'wrong_number' | 'same_user_twice'
                                  -- | 'invalid_format' | 'manual'
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_counter_history_channel
  ON counter_history(channel_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_counter_history_user
  ON counter_history(guild_id, user_id, ts DESC);

CREATE TABLE IF NOT EXISTS counter_stats (
  channel_id TEXT PRIMARY KEY,
  best   INTEGER NOT NULL DEFAULT 0,
  counts INTEGER NOT NULL DEFAULT 0,
  ruins  INTEGER NOT NULL DEFAULT 0
);
