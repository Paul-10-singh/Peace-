'use strict';
/*
 * Peace* -- Discord Bot -- Developed by Smith.Code
 *
 * Counter -- store.js (Deliverable 2 / data-access layer)
 *
 * Byte-locked to schema.sql: EXACTLY 3 counter tables
 *   counter_channels    per-channel config + live counting state
 *   counter_history    append-only audit of counts / ruins / resets
 *   counter_stats     per-channel rollups (best / counts / ruins)
 *
 * Idiom: prepared statements, same boot contract as the counter store:
 *   - This module does NOT own the db handle open/close/PRAGMA/WAL
 *     (db.js owns open()), it only opens one handle on require like
 *     the canonical store does, then works with prepared statements.
 *   - Every public function validates its inputs FIRST (assertId /
 *     assertPositiveInt / assertNonEmptyString...) and throws a
 *     TypeError with a counter-prefixed message on bad input -- NO
 *     silent writes, NO accepting junk.
 *   - Multi-statement writes are wrapped in db.transaction() so a
 *     successful count / ruin hits the DB atomically.
 *   - Everything is strictly Counter-flavored.
 */

const { open, REQUIRED_TABLES } = require('./db');

const db = open();

/* ------------------------------------------------------------------ */
/* counter_channels -- prepared statements                              */
/* ------------------------------------------------------------------ */

const sqlChannelGet = db.prepare(
  `SELECT * FROM counter_channels WHERE channel_id = ?`
);
const sqlChannelListByGuild = db.prepare(
  `SELECT * FROM counter_channels WHERE guild_id = ? ORDER BY created_at ASC`
);
const sqlChannelUpsert = db.prepare(
  `INSERT INTO counter_channels (
     channel_id, guild_id, mode, on_ruin, on_success,
     same_user_guard, notify_previous, reset_behavior, checkpoint_every,
     current, last_counter_id, best, resets, ruins, paused,
     created_at, updated_at
   ) VALUES (
     @channel_id, @guild_id, @mode, @on_ruin, @on_success,
     @same_user_guard, @notify_previous, @reset_behavior, @checkpoint_every,
     @current, @last_counter_id, @best, @resets, @ruins, @paused,
     @created_at, @updated_at
   )
   ON CONFLICT(channel_id) DO UPDATE SET
     mode             = excluded.mode,
     on_ruin          = excluded.on_ruin,
     on_success       = excluded.on_success,
     same_user_guard  = excluded.same_user_guard,
     notify_previous  = excluded.notify_previous,
     reset_behavior   = excluded.reset_behavior,
     checkpoint_every = excluded.checkpoint_every,
     current          = excluded.current,
     last_counter_id  = excluded.last_counter_id,
     best             = excluded.best,
     resets           = excluded.resets,
     ruins            = excluded.ruins,
     paused           = excluded.paused,
     updated_at       = excluded.updated_at`
);
const sqlChannelDelete = db.prepare(
  `DELETE FROM counter_channels WHERE channel_id = ?`
);

/* ------------------------------------------------------------------ */
/* counter_history -- prepared statements                               */
/* ------------------------------------------------------------------ */

const sqlHistoryInsert = db.prepare(
  `INSERT INTO counter_history (
     channel_id, guild_id, user_id, number, kind, reason, ts
   ) VALUES (
     @channel_id, @guild_id, @user_id, @number, @kind, @reason, @ts
   )`
);
const sqlHistoryRecent = db.prepare(
  `SELECT * FROM counter_history
   WHERE channel_id = ? ORDER BY ts DESC LIMIT ?`
);

/* ------------------------------------------------------------------ */
/* counter_stats -- prepared statements                                 */
/* ------------------------------------------------------------------ */

const sqlStatsGet = db.prepare(`SELECT * FROM counter_stats WHERE channel_id = ?`);
const sqlStatsUpsert = db.prepare(
  `INSERT INTO counter_stats (channel_id, best, counts, ruins)
   VALUES (@channel_id, @best, @counts, @ruins)
   ON CONFLICT(channel_id) DO UPDATE SET
     best    = excluded.best,
     counts  = excluded.counts,
     ruins   = excluded.ruins`
);

/* ------------------------------------------------------------------ */
/* input validation (assert-first, no silent writes)                    */
/* ------------------------------------------------------------------ */

function assertId(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`counter: ${name} must be a non-empty string (got ${JSON.stringify(value)})`);
  }
  return value;
}

function assertNonNegativeInt(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(
      `counter: ${name} must be a non-negative safe integer (got ${JSON.stringify(value)})`
    );
  }
  return value;
}

function assertTimestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`counter: ts must be a non-negative safe integer (got ${JSON.stringify(value)})`);
  }
  return value;
}

class CounterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CounterError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* row mappers                                                          */
/* ------------------------------------------------------------------ */

function rowToChannel(row) {
  return {
    channelId: row.channel_id,
    guildId: row.guild_id,
    mode: row.mode,
    onRuin: row.on_ruin,
    onSuccess: row.on_success,
    sameUserGuard: row.same_user_guard === 1,
    notifyPrevious: row.notify_previous === 1,
    resetBehavior: row.reset_behavior,
    checkpointEvery: row.checkpoint_every,
    current: row.current,
    lastCounterId: row.last_counter_id,
    best: row.best,
    resets: row.resets,
    ruins: row.ruins,
    paused: row.paused === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function channelToRow(channel) {
  return {
    channel_id: channel.channelId,
    guild_id: channel.guildId,
    mode: channel.mode,
    on_ruin: channel.onRuin,
    on_success: channel.onSuccess,
    same_user_guard: channel.sameUserGuard ? 1 : 0,
    notify_previous: channel.notifyPrevious ? 1 : 0,
    reset_behavior: channel.resetBehavior,
    checkpoint_every: channel.checkpointEvery,
    current: channel.current,
    last_counter_id: channel.lastCounterId,
    best: channel.best,
    resets: channel.resets,
    ruins: channel.ruins,
    paused: channel.paused ? 1 : 0,
    created_at: channel.createdAt,
    updated_at: channel.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* counter_channels -- public API                                       */
/* ------------------------------------------------------------------ */

function getChannel(channelId) {
  assertId(channelId, 'channel_id');
  const row = sqlChannelGet.get(channelId);
  return row ? rowToChannel(row) : null;
}

function getOrCreateChannel({
  channelId,
  guildId,
  mode = 'numbers_only',
  onRuin = 'delete',
  onSuccess = 'react_number',
  sameUserGuard = true,
  notifyPrevious = true,
  resetBehavior = 'to_zero',
  checkpointEvery = 100,
  current = 0,
  best = 0,
  resets = 0,
  ruins = 0,
  paused = false,
  ts = Date.now(),
} = {}) {
  assertId(channelId, 'channel_id');
  assertId(guildId, 'guild_id');
  const m = ['numbers_only', 'numbers_arithmetic'];
  if (!m.includes(mode)) {
    throw new TypeError(`counter: mode must be numbers_only or numbers_arithmetic (got ${JSON.stringify(mode)})`);
  }
  if (onRuin !== 'delete' && onRuin !== 'react') {
    throw new TypeError(`counter: on_ruin must be delete or react (got ${JSON.stringify(onRuin)})`);
  }
  const s = ['react_number', 'react_check', 'none'];
  if (!s.includes(onSuccess)) {
    throw new TypeError(`counter: on_success must be react_number, react_check or none (got ${JSON.stringify(onSuccess)})`);
  }
  if (resetBehavior !== 'to_zero' && resetBehavior !== 'to_checkpoint') {
    throw new TypeError(`counter: reset_behavior must be to_zero or to_checkpoint (got ${JSON.stringify(resetBehavior)})`);
  }
  if (![0, 100, 500].includes(checkpointEvery)) {
    throw new TypeError(`counter: checkpoint_every must be 0, 100 or 500 (got ${JSON.stringify(checkpointEvery)})`);
  }
  assertNonNegativeInt(current, 'current');
  assertNonNegativeInt(best, 'best');
  assertNonNegativeInt(resets, 'resets');
  assertNonNegativeInt(ruins, 'ruins');
  assertTimestamp(ts);

  const row = sqlChannelGet.get(channelId);
  if (row) return rowToChannel(row);

  const channel = {
    channelId,
    guildId,
    mode,
    onRuin,
    onSuccess,
    sameUserGuard,
    notifyPrevious,
    resetBehavior,
    checkpointEvery,
    current,
    lastCounterId: null,
    best,
    resets,
    ruins,
    paused,
    createdAt: ts,
    updatedAt: ts,
  };
  const seed = db.transaction(() => {
    sqlChannelUpsert.run(channelToRow(channel));
    sqlStatsUpsert.run({ channel_id: channelId, best, counts: 0, ruins: 0 });
  });
  seed();
  return rowToChannel(sqlChannelGet.get(channelId));
}

function patchChannel(channelId, patch) {
  assertId(channelId, 'channel_id');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new TypeError(`counter: patch must be a plain object (got ${JSON.stringify(patch)})`);
  }
  const row = sqlChannelGet.get(channelId);
  if (!row) return null;
  const merged = { ...rowToChannel(row), ...patch, channelId };
  if (Object.hasOwn(patch, 'current')) {
    assertNonNegativeInt(patch.current, 'current');
    merged.current = patch.current;
  }
  if (Object.hasOwn(patch, 'best')) {
    assertNonNegativeInt(patch.best, 'best');
    merged.best = patch.best;
  }
  if (Object.hasOwn(patch, 'resets')) {
    assertNonNegativeInt(patch.resets, 'resets');
    merged.resets = patch.resets;
  }
  if (Object.hasOwn(patch, 'ruins')) {
    assertNonNegativeInt(patch.ruins, 'ruins');
    merged.ruins = patch.ruins;
  }
  merged.updatedAt = Date.now();
  sqlChannelUpsert.run(channelToRow(merged));
  return rowToChannel(sqlChannelGet.get(channelId));
}

function deleteChannel(channelId) {
  assertId(channelId, 'channel_id');
  const clear = db.transaction(() => {
    sqlChannelDelete.run(channelId);
    db.prepare(`DELETE FROM counter_history WHERE channel_id = ?`).run(channelId);
    db.prepare(`DELETE FROM counter_stats WHERE channel_id = ?`).run(channelId);
  });
  clear();
  return true;
}

function listChannels(guildId) {
  assertId(guildId, 'guild_id');
  return sqlChannelListByGuild.all(guildId).map(rowToChannel);
}

function requireChannel(channelId) {
  const channel = getChannel(channelId);
  if (!channel) {
    throw new CounterError(
      'not_configured',
      `counter: channel ${JSON.stringify(channelId)} is not configured`
    );
  }
  if (channel.paused) {
    throw new CounterError('paused', `counter: channel ${JSON.stringify(channelId)} is paused`);
  }
  return channel;
}

/* ------------------------------------------------------------------ */
/* counting engine writes (count / ruin, transactional)                 */
/* ------------------------------------------------------------------ */

/**
 * Record a correct count on the given channel.
 * On success returns { ok:true, number, next, isBest, isMilestone }.
 * On a sequential violation returns { ok:false, reason } where reason is
 *   'wrong_number' | 'same_user_twice'  (the caller decides the ruin).
 * The number must equal channel.current + 1 and, when same_user_guard is
 * on, must NOT come from the user who made the previous count.
 */
function recordCount({ channelId, userId, number, ts = Date.now() }) {
  assertId(channelId, 'channel_id');
  assertId(userId, 'user_id');
  assertNonNegativeInt(number, 'number');
  assertTimestamp(ts);
  const channel = requireChannel(channelId, { allowPausedForRuin: false });
  const expected = channel.current + 1;

  if (number !== expected) return { ok: false, reason: 'wrong_number', expected };
  if (channel.sameUserGuard && channel.lastCounterId === userId) {
    return { ok: false, reason: 'same_user_twice' };
  }

  const isBest = number > channel.best;
  const isMilestone =
    channel.checkpointEvery > 0 && number % channel.checkpointEvery === 0;

  const apply = db.transaction(() => {
    sqlChannelUpsert.run(
      channelToRow({
        ...channel,
        current: number,
        lastCounterId: userId,
        best: isBest ? number : channel.best,
        updatedAt: ts,
      })
    );
    sqlHistoryInsert.run({
      channel_id: channelId,
      guild_id: channel.guildId,
      user_id: userId,
      number,
      kind: 'count',
      reason: null,
      ts,
    });
    const statRow = sqlStatsGet.get(channelId);
    sqlStatsUpsert.run({
      channel_id: channelId,
      best: isBest ? number : (statRow?.best || channel.best),
      counts: (statRow?.counts || 0) + 1,
      ruins: statRow?.ruins || 0,
    });
  });
  apply();

  return { ok: true, number, next: number + 1, isBest, isMilestone };
}

function recordRuin({ channelId, userId, number, reason, ts = Date.now() }) {
  assertId(channelId, 'channel_id');
  assertId(userId, 'user_id');
  assertNonNegativeInt(number, 'number');
  assertTimestamp(ts);
  const allowed = ['wrong_number', 'same_user_twice', 'invalid_format', 'manual'];
  if (!allowed.includes(reason)) {
    throw new TypeError(`counter: reason must be one of ${allowed.join(', ')} (got ${JSON.stringify(reason)})`);
  }
  const channel = requireChannel(channelId, { allowPausedForRuin: true });
  const resetTo =
    channel.resetBehavior === 'to_checkpoint' && channel.checkpointEvery > 0
      ? Math.floor(channel.current / channel.checkpointEvery) * channel.checkpointEvery
      : 0;

  const apply = db.transaction(() => {
    sqlChannelUpsert.run(
      channelToRow({
        ...channel,
        current: resetTo,
        lastCounterId: null,
        resets: channel.resets + 1,
        ruins: channel.ruins + 1,
        updatedAt: ts,
      })
    );
    sqlHistoryInsert.run({
      channel_id: channelId,
      guild_id: channel.guildId,
      user_id: userId,
      number,
      kind: 'ruin',
      reason,
      ts,
    });
    const statRow = sqlStatsGet.get(channelId);
    sqlStatsUpsert.run({
      channel_id: channelId,
      best: statRow?.best || channel.best,
      counts: statRow?.counts || 0,
      ruins: (statRow?.ruins || 0) + 1,
    });
  });
  apply();

  return { ok: true, resetTo, next: resetTo + 1 };
}

/* ------------------------------------------------------------------ */
/* history + stats read surfaces                                        */
/* ------------------------------------------------------------------ */

function getStats(channelId) {
  assertId(channelId, 'channel_id');
  const row = sqlStatsGet.get(channelId);
  return row ? { channelId, best: row.best, counts: row.counts, ruins: row.ruins } : null;
}

function listHistory(channelId, limit = 25) {
  assertId(channelId, 'channel_id');
  assertNonNegativeInt(limit, 'limit');
  return sqlHistoryRecent.all(channelId, Math.min(200, limit));
}

module.exports = {
  REQUIRED_TABLES,
  getChannel,
  getOrCreateChannel,
  patchChannel,
  deleteChannel,
  listChannels,
  requireChannel,
  recordCount,
  recordRuin,
  getStats,
  listHistory,
};
