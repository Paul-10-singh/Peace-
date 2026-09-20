/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 8 : USER REPUTATION SCORE.
 *
 * Per-user lifetime score in [0, 1] that starts at 1.0 and decays monthly
 * toward 0.5 (forgetting old offenses). Enforcement events subtract, appeals
 * with evidence add back. Mechanics are pure — no user data leaves the bot.
 */
let DB = null;
const DECAY_INTERVAL = 30 * 24 * 60 * 60 * 1000;
const DECAY_FACTOR = 0.9;
const FLOOR = 0.1;

function init(db) { DB = db; return reputationApi; }

function get(userId, { now = Date.now() } = {}) {
  if (!DB) return 1.0;
  const row = DB.prepare('SELECT * FROM user_reputation WHERE user_id = ?').get(userId);
  if (!row) return 1.0;
  // monthly decay toward floor
  let { score, last_decay_at, offense_count, updated_at } = row;
  if (now - last_decay_at >= DECAY_INTERVAL) {
    const months = Math.floor((now - last_decay_at) / DECAY_INTERVAL);
    for (let i = 0; i < months; i += 1) score = Math.max(FLOOR, score * DECAY_FACTOR);
    DB.prepare('UPDATE user_reputation SET score = ?, last_decay_at = ? WHERE user_id = ?').run(score, now, userId);
  }
  return Number(score.toFixed(3));
}

/** Adjust (delta in [-1, 1]); clamps to [0, 1]. */
function adjust(userId, delta, { now = Date.now() } = {}) {
  if (!DB) return get(userId);
  const current = get(userId, { now }); // decays first
  const score = Math.max(0, Math.min(1, current + delta));
  DB.prepare(`
    INSERT INTO user_reputation (user_id, score, offense_count, last_decay_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      score = excluded.score, updated_at = excluded.updated_at
  `).run(userId, score, now, now);
  return score;
}

function bumpOffense(userId) {
  if (!DB) return 0;
  DB.prepare('UPDATE user_reputation SET offense_count = offense_count + 1 WHERE user_id = ?').run(userId);
  return DB.prepare('SELECT offense_count FROM user_reputation WHERE user_id = ?').get(userId)?.offense_count || 0;
}

function disable() { /* state is persisted; nothing to unwind */ }

const reputationApi = { init, get, adjust, bumpOffense, disable };

module.exports = reputationApi;