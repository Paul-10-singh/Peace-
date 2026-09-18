/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Voice-channel activity tracker (ported from the Vybe ✘ build).
 *
 * Records how long each member spends in voice per guild per day, then powers:
 *   /vcstats         - weekly time + remaining hours to reach the goal
 *   /vcstats_custom  - same stats for a manual YYYY-MM-DD range
 *   /vchart          - server-wide weekly chart
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

// Weekly goal (hours) required for a member to count as "active".
const WEEKLY_GOAL_HOURS = (() => {
  const n = parseFloat(process.env.VC_WEEKLY_GOAL_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 10;
})();

// Emoji set used by the chart / stats embeds. All universal unicode so they
// render correctly in EVERY server (custom emojis showed as `:name:` text
// anywhere outside the server that owned them).
const E = {
  correct: '✅',
  wrong: '❌',
  time: '⏱️',
  status: '📊',
  weeklychart: '📈',
  period: '📅',
  target: '🎯',
  owner: '👑',
  goalcompleted: '🏆',
  ACTIVEstatus: '🟢',
  INACTIVEstatus: '🔴',
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

/** Inclusive [startDate, endDate] for the current (offset 0) or previous week. */
function getWeekRange(daysOffset = 0) {
  return { startDate: daysAgoStr(daysOffset + 6), endDate: daysAgoStr(daysOffset) };
}

// ── SQLite store ────────────────────────────────────────────────────────
let db = null;
let insertStmt = null;
let selectRange = null;
let selectGuildRange = null;
try {
  const Database = require('better-sqlite3');
  db = new Database(path.join(DATA_DIR, 'vc_tracker.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS vc_time (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      date TEXT NOT NULL,
      seconds_spent REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, guild_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_vc_guild_date ON vc_time(guild_id, date);
  `);
  insertStmt = db.prepare(`
    INSERT INTO vc_time (user_id, guild_id, date, seconds_spent)
    VALUES (@user_id, @guild_id, @date, @seconds)
    ON CONFLICT(user_id, guild_id, date) DO UPDATE SET seconds_spent = seconds_spent + @seconds
  `);
  selectRange = db.prepare(
    'SELECT date, seconds_spent FROM vc_time WHERE user_id = ? AND guild_id = ? AND date >= ? AND date <= ?'
  );
  selectGuildRange = db.prepare(
    'SELECT user_id, SUM(seconds_spent) AS total FROM vc_time WHERE guild_id = ? AND date >= ? AND date <= ? GROUP BY user_id'
  );
} catch (err) {
  db = null;
  console.warn(`[PeaceX] [vcTracker] SQLite binding unavailable (${err.message}) — using JSON fallback.`);
}

// ── JSON fallback store: { "guildId:userId": { "YYYY-MM-DD": seconds } } ─
const FB_FILE = path.join(DATA_DIR, 'vc_tracker.json');
let fbCache = null;
function fbStore() {
  if (fbCache) return fbCache;
  try {
    fbCache = JSON.parse(fs.readFileSync(FB_FILE, 'utf8'));
  } catch {
    fbCache = {};
  }
  return fbCache;
}
function fbPersist() {
  try {
    fs.writeFileSync(FB_FILE, JSON.stringify(fbCache, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[PeaceX] [vcTracker] Failed to persist fallback store: ${err.message}`);
  }
}

// ── Active sessions: Map<`${guildId}:${userId}`, joinMs> ────────────────
const activeSessions = new Map();

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function addTime(userId, guildId, seconds) {
  if (!(seconds > 0)) return;
  const date = todayStr();
  if (db) {
    insertStmt.run({ user_id: String(userId), guild_id: String(guildId), date, seconds });
    return;
  }
  const store = fbStore();
  const key = sessionKey(guildId, userId);
  if (!store[key]) store[key] = {};
  store[key][date] = (store[key][date] || 0) + seconds;
  fbPersist();
}

/** Voice-state handler: join / leave / move accounting. */
function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user?.bot) return;

  const guildId = newState.guild?.id || oldState.guild?.id;
  if (!guildId) return;

  const key = sessionKey(guildId, member.id);
  const before = oldState.channelId;
  const after = newState.channelId;
  const now = Date.now();

  if (!before && after) {
    activeSessions.set(key, now);
    return;
  }

  if (before && !after) {
    const joined = activeSessions.get(key);
    if (joined != null) {
      activeSessions.delete(key);
      addTime(member.id, guildId, (now - joined) / 1000);
    }
    return;
  }

  if (before && after && before !== after) {
    const joined = activeSessions.get(key);
    if (joined != null) {
      activeSessions.delete(key);
      addTime(member.id, guildId, (now - joined) / 1000);
    }
    activeSessions.set(key, now);
  }
}

/** Seed members already in voice at boot so restarts don't drop the session. */
function seedActiveSessions(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      const member = state.member;
      if (!state.channelId || !member || member.user?.bot) continue;
      activeSessions.set(sessionKey(guild.id, member.id), now);
    }
  }
}

/** Seconds of the in-progress session for a member, if any. */
function getLiveSeconds(userId, guildId) {
  const joined = activeSessions.get(sessionKey(guildId, userId));
  return joined == null ? 0 : (Date.now() - joined) / 1000;
}

/** Format seconds as `HH:MM:SS` (e.g. `10:20:36`). */
function formatHMS(seconds) {
  const s = Math.floor(Math.max(0, seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** { totalSeconds, dailyMap: { 'YYYY-MM-DD': seconds } } for a date range. */
function getUserStats(userId, guildId, startDate, endDate) {
  if (db) {
    const rows = selectRange.all(String(userId), String(guildId), startDate, endDate);
    const dailyMap = {};
    let total = 0;
    for (const row of rows) {
      dailyMap[row.date] = row.seconds_spent;
      total += row.seconds_spent;
    }
    return { totalSeconds: total, dailyMap };
  }

  const store = fbStore();
  const data = store[sessionKey(guildId, userId)] || {};
  const dailyMap = {};
  let total = 0;
  for (const [date, seconds] of Object.entries(data)) {
    if (date >= startDate && date <= endDate) {
      dailyMap[date] = seconds;
      total += seconds;
    }
  }
  return { totalSeconds: total, dailyMap };
}

/** [[userId, totalSeconds], ...] for every member active in the range. */
function getGuildStats(guildId, startDate, endDate) {
  if (db) {
    return selectGuildRange
      .all(String(guildId), startDate, endDate)
      .map((row) => [row.user_id, row.total]);
  }
  const prefix = `${guildId}:`;
  const totals = new Map();
  for (const [key, data] of Object.entries(fbStore())) {
    if (!key.startsWith(prefix)) continue;
    const userId = key.slice(prefix.length);
    let sum = 0;
    for (const [date, seconds] of Object.entries(data)) {
      if (date >= startDate && date <= endDate) sum += seconds;
    }
    if (sum > 0) totals.set(userId, sum);
  }
  return [...totals.entries()];
}

/** ASCII chart string, matching the original report layout. */
function generateWeeklyReport(guild, daysOffset = 0) {
  const { startDate, endDate } = getWeekRange(daysOffset);
  const rows = getGuildStats(guild.id, startDate, endDate).sort((a, b) => b[1] - a[1]);

  if (!rows.length) return 'No voice chat activity recorded for this period.';

  const label = daysOffset === 0 ? 'THIS WEEK' : 'LAST WEEK';
  const lines = [
    `${E.weeklychart} **WEEKLY VC ACTIVITY CHART (${label})**`,
    `${E.period} Period: ${startDate} to ${endDate}`,
    `${E.target} Target Goal: ${WEEKLY_GOAL_HOURS} Hours`,
    '```',
    `${'Member'.padEnd(18)} | ${'Time Spent'.padEnd(12)} | ${'Status'.padEnd(10)}`,
    '-'.repeat(48),
  ];

  for (const [userId, totalSeconds] of rows) {
    const member = guild.members.cache.get(String(userId));
    const name = (member ? member.displayName : `User ${userId}`).slice(0, 16);
    const timeStr = formatHMS(totalSeconds);
    const status = totalSeconds >= WEEKLY_GOAL_HOURS * 3600 ? `ACTIVE ${E.correct}` : `INACTIVE ${E.wrong}`;
    lines.push(`${name.padEnd(18)} | ${timeStr.padEnd(12)} | ${status}`);
  }

  lines.push('```');
  return lines.join('\n');
}

/** Split text into <=limit chunks on line boundaries (Discord 2000-char cap). */
function splitMessage(text, limit = 1900) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit) {
      if (current) chunks.push(current);
      current = line.length > limit ? line.slice(0, limit) : line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ── Automated Sunday report (11 PM, DMs every guild owner) ──────────────
function startWeeklyReportScheduler(client) {
  const tick = async () => {
    const now = new Date();
    if (now.getDay() !== 0 || now.getHours() !== 23) return; // Sunday 23:00

    const stamp = `${toDateStr(now)}T${now.getHours()}`;
    if (client._vcReportStamp === stamp) return;
    client._vcReportStamp = stamp;

    for (const guild of client.guilds.cache.values()) {
      let owner = guild.owner;
      if (!owner) owner = await guild.fetchOwner().catch(() => null);
      if (!owner) continue;

      const chart = generateWeeklyReport(guild, 0);
      const chunks = splitMessage(`${E.owner} **Sunday VC Activity Report for ${guild.name}**\n\n${chart}`);
      try {
        for (const chunk of chunks) await owner.send(chunk);
      } catch {
        console.warn(`[PeaceX] [vcTracker] Failed to DM owner of ${guild.name}.`);
      }
    }
  };

  setInterval(() => { tick().catch(() => {}); }, 15 * 60 * 1000);
  tick().catch(() => {});
}

module.exports = {
  E,
  WEEKLY_GOAL_HOURS,
  todayStr,
  daysAgoStr,
  isValidDate,
  getWeekRange,
  handleVoiceStateUpdate,
  seedActiveSessions,
  getLiveSeconds,
  formatHMS,
  getUserStats,
  getGuildStats,
  generateWeeklyReport,
  splitMessage,
  startWeeklyReportScheduler,
};