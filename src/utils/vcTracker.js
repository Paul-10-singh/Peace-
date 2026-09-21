/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Voice-channel activity tracker (ported from the Vybe ✘ build).
 *
 * Records how long each member spends in voice per guild per day, then powers:
 *   /vc stats        - weekly time + remaining hours to reach the goal
 *   /vc custom_stats - same stats for a manual YYYY-MM-DD range
 *   /vc task         - leaderboard for all members holding a role
 *   /vc chart        - server-wide weekly chart
 *   Sunday report    - automated DM chart to each guild owner
 *
 * Storage: SQLite (data/vc_tracker.db) when better-sqlite3 is installed,
 * with a JSON fallback (data/vc_tracker.json) otherwise.
 *
 * NOTE: sessions are tracked in-memory. On boot we seed members already in
 * voice so a restart does not lose the current session.
 */
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Live sessions are persisted to disk so no time is lost across a bot restart,
// and periodically reconciled against the live Discord client so missed
// events (gateway hiccup, restart, dropped voiceStateUpdate) get corrected.
const SESSION_FILE = path.join(DATA_DIR, 'vc_sessions.json');
const LIVE_SYNC_MS = (() => {
  const n = parseFloat(process.env.VC_SYNC_INTERVAL_SECONDS);
  return Number.isFinite(n) && n > 0 ? n * 1000 : 60_000;
})();

// Weekly goal (hours) required for a member to count as "active".
const WEEKLY_GOAL_HOURS = (() => {
  const n = parseFloat(process.env.VC_WEEKLY_GOAL_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 10;
})();

// Emoji set used by the chart / stats embeds (host-server custom emojis).
const E = {
  correct: '<a:correct:1550504846199758928>',
  wrong: '<a:wrong:1550504971303395430>',
  time: '<a:time:1550504955691929630>',
  status: '<a:status:1550504949882953820>',
  weeklychart: '<:weeklychart:1550504968119652503>',
  period: '<:period:1550504918756892682>',
  target: '<:target:1550504952349196479>',
  owner: '<a:owner:1550504913815994418>',
  goalcompleted: '<:goalcompleted:1550504884049154159>',
  ACTIVEstatus: '<:ACTIVEstatus:1550504832106766406>',
  INACTIVEstatus: '<:INACTIVEstatus:1550504891758149773>',
};

// ── Date helpers (local time, matching the original build) ──────────────
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return toDateStr(d) === value;
}
