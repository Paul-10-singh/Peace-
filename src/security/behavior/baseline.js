/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 2 : BEHAVIORAL BASELINES (UEBA, no ML deps).
 *
 * Per-user behavioral time-series with an online mean/variance baseline
 * using Welford's algorithm (numerically-stable one-pass variance).
 *
 * Metrics tracked per (user, guild) over a rolling 7-day window:
 *   actions.hourly.count    — events in a sliding 60-minute window
 *   actions.hourly.distinct — distinct targets touched in that window
 *   actions.velocity.min    — max events observed in a 60s bucket today
 *
 * A z-score > 3.5 on any metric (with >= 50 baseline samples) flags the
 * user. Every event is stored in behavior_events so baselines can be
 * rebuilt deterministically and are inspectable via the dashboard.
 */
const Z_THRESHOLD = 3.5;
const MIN_SAMPLES = 50;
const WINDOW_DAYS = 7;

let DB = null;

function init(db) {
  DB = db;
  return behaviorApi;
}

const insertEvent = () =>
  DB.prepare(`
    INSERT INTO behavior_events (user_id, guild_id, action, target, ts, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

/** Record one behavioral event (inserted, baseline folded lazily). */
function recordEvent(userId, guildId, action, target = null, metadata = {}, ts = Date.now()) {
  if (!DB) return null;
  insertEvent().run(userId, guildId, action, target, ts, JSON.stringify(metadata || {}));
  // cheap incremental fold of the "velocity" baseline for hot users
  foldHourlyBuckets(userId, guildId, { now: ts });
  return { userId, guildId, action, ts };
}

function eventsIn(userId, guildId, startTs, endTs = Date.now()) {
  if (!DB) return [];
  return DB.prepare(`
    SELECT * FROM behavior_events
    WHERE user_id = ? AND guild_id = ? AND ts >= ? AND ts <= ?
    ORDER BY ts ASC
  `).all(userId, guildId, startTs, endTs);
}

/** Slice events into hourly observation buckets for a rolling window. */
function hourlySamples(userId, guildId, { windowMs = WINDOW_DAYS * 86_400_000, now = Date.now() } = {}) {
  const start = now - windowMs;
  const rows = eventsIn(userId, guildId, start, now);
  const buckets = new Map();
  for (const row of rows) {
    const hourBucket = Math.floor(row.ts / 3_600_000);
    if (!buckets.has(hourBucket)) buckets.set(hourBucket, { count: 0, targets: new Set() });
    const b = buckets.get(hourBucket);
    b.count += 1;
    if (row.target) b.targets.add(row.target);
  }
  return [...buckets.entries()].map(([bucket, data]) => ({
    bucket,
    ts: bucket * 3_600_000,
    actionsPerHour: data.count,
    distinctTargets: data.targets.size,
  }));
}

// ── Welford update over the stored baseline ────────────────────────────────
function welfordUpdate(userId, guildId, metric, sample, windowMs = WINDOW_DAYS * 86_400_000) {
  const row = DB.prepare(
    'SELECT * FROM behavior_baselines WHERE user_id = ? AND guild_id = ? AND metric = ?'
  ).get(userId, guildId, metric);

  const count = (row?.count || 0) + 1;
  const mean = row ? row.mean : 0;
  const m2 = row ? row.m2 : 0;
  const delta = sample - mean;
  const newMean = count === 1 ? sample : mean + delta / count;
  const newM2 = row ? m2 + delta * (sample - newMean) : 0;

  DB.prepare(`
    INSERT INTO behavior_baselines (user_id, guild_id, metric, count, mean, m2, window_ms, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, guild_id, metric) DO UPDATE SET
      count = excluded.count, mean = excluded.mean, m2 = excluded.m2,
      window_ms = excluded.window_ms, updated_at = excluded.updated_at
  `).run(userId, guildId, metric, count, newMean, newM2, windowMs, Date.now());

  return { count, mean: newMean, m2: newM2 };
}

function baselineOf(userId, guildId, metric) {
  return DB.prepare(
    'SELECT * FROM behavior_baselines WHERE user_id = ? AND guild_id = ? AND metric = ?'
  ).get(userId, guildId, metric) || { count: 0, mean: 0, m2: 0 };
}

/**
 * Fold each hourly observation since the last fold point into the baseline
 * (Welford). A bucket is only folded once its hour has fully closed
 * (bucketEnd <= now) — an open hour still collects events, so folding it
 * early would under-count bursts. Idempotent per hour.
 */
function foldHourlyBuckets(userId, guildId, { now = Date.now() } = {}) {
  if (!DB) return 0;
  const meta = DB.prepare('SELECT folded_through FROM behavior_meta WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  const foldedThrough = meta?.folded_through || 0;
  // a full new hour of data is required before folding again
  if (foldedThrough !== 0 && now - foldedThrough < 3_600_000) return 0;

  const samples = hourlySamples(userId, guildId, { now });
  let folded = 0;
  let newestClosedStart = foldedThrough;
  for (const s of samples) {
    const bucketStart = s.bucket * 3_600_000;
    const bucketEnd = bucketStart + 3_600_000;
    if (!(bucketEnd <= now)) continue;      // hour still open
    if (bucketStart <= foldedThrough) continue; // already folded
    welfordUpdate(userId, guildId, 'actions.hourly.count', s.actionsPerHour);
    welfordUpdate(userId, guildId, 'actions.hourly.distinct', s.distinctTargets);
    folded += 1;
    if (bucketStart > newestClosedStart) newestClosedStart = bucketStart;
  }
  // velocity: max 60s-window count observed in the last 7d
  const start = now - WINDOW_DAYS * 86_400_000;
  const rows = eventsIn(userId, guildId, start, now);
  const posCounts = new Map();
  for (const r of rows) {
    const pos = Math.floor(r.ts / 60_000);
    posCounts.set(pos, (posCounts.get(pos) || 0) + 1);
  }
  let maxMin = 0;
  for (const c of posCounts.values()) if (c > maxMin) maxMin = c;
  welfordUpdate(userId, guildId, 'actions.velocity.min', maxMin);

  DB.prepare(`
    INSERT INTO behavior_meta (user_id, guild_id, folded_through)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET folded_through = excluded.folded_through
  `).run(userId, guildId, newestClosedStart || foldedThrough);

  return folded;
}

/** Current-window metric sample for a user. */
function currentSample(userId, guildId, { now = Date.now() } = {}) {
  const hourly = hourlySamples(userId, guildId, { windowMs: 3_600_000, now });
  const last = hourly[hourly.length - 1];
  const inLastMin = eventsIn(userId, guildId, now - 60_000, now).length;
  const inLastHour = eventsIn(userId, guildId, now - 3_600_000, now).length;
  const targets = new Set(eventsIn(userId, guildId, now - 3_600_000, now).map((r) => r.target).filter(Boolean));
  return {
    'actions.velocity.min': inLastMin,
    'actions.hourly.count': inLastHour,
    'actions.hourly.distinct': targets.size,
    recentSinceMs: 3_600_000,
  };
}

/**
 * Z-score each metric. Returns anomalies where z > 3.5 AND sample > mean
 * (a *drop* below the baseline is not an attack signal).
 */
function anomalies(userId, guildId, { now = Date.now() } = {}) {
  if (!DB) return { anomalies: [], zscores: {} };
  foldHourlyBuckets(userId, guildId, { now });
  const sample = currentSample(userId, guildId, { now });
  const results = [];

  for (const [metric, value] of Object.entries(sample)) {
    const base = baselineOf(userId, guildId, metric);
    const std = base.count > 1 ? Math.sqrt(base.m2 / (base.count - 1)) : 0;
    const z = std > 0 ? (value - base.mean) / std : 0;
    const flagged = base.count >= MIN_SAMPLES && z > Z_THRESHOLD && value > base.mean;
    results.push({
      metric, value, mean: base.mean, std, z: Number(z.toFixed(3)),
      samples: base.count, anomalous: flagged,
    });
  }

  return {
    anomalies: results.filter((r) => r.anomalous),
    zscores: Object.fromEntries(results.map((r) => [r.metric, r.z])),
  };
}

/** Expose raw stats for the dashboard / tests. */
function stats(userId, guildId, { now = Date.now() } = {}) {
  const res = anomalies(userId, guildId, { now });
  return {
    events: eventsIn(userId, guildId, now - WINDOW_DAYS * 86_400_000, now).length,
    baselines: DB.prepare(
      'SELECT metric, count, mean, m2 FROM behavior_baselines WHERE user_id = ? AND guild_id = ?'
    ).all(userId, guildId),
    ...res,
  };
}

function clear(userId, guildId) {
  if (!DB) return;
  DB.prepare('DELETE FROM behavior_events WHERE user_id = ? AND guild_id = ?').run(userId, guildId);
  DB.prepare('DELETE FROM behavior_baselines WHERE user_id = ? AND guild_id = ?').run(userId, guildId);
  DB.prepare('DELETE FROM behavior_meta WHERE user_id = ? AND guild_id = ?').run(userId, guildId);
}

const behaviorApi = { init, recordEvent, hourlySamples, foldHourlyBuckets, currentSample, anomalies, stats, clear, welfordUpdate, baselineOf, eventsIn, Z_THRESHOLD, MIN_SAMPLES };

module.exports = behaviorApi;