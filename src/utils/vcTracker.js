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

// ── One-time migration: fold the JSON fallback store into SQLite ─────────
// If the bot previously ran without better-sqlite3 it recorded time into
// data/vc_tracker.json. On first boot with SQLite available we merge those
// rows into vc_time (never overwriting existing data) and archive the JSON.
function migrateJsonFallbackIntoDb() {
  if (!db || !fs.existsSync(FB_FILE)) return;
  const archive = `${FB_FILE}.migrated`;
  try {
    const raw = JSON.parse(fs.readFileSync(FB_FILE, 'utf8'));
    const merged = db.prepare(
      'SELECT 1 FROM vc_time WHERE user_id = ? AND guild_id = ? AND date = ?'
    );
    let moved = 0;
    const tx = db.transaction(() => {
      for (const [key, dates] of Object.entries(raw)) {
        const sep = key.indexOf(':');
        if (sep === -1) continue;
        const guildId = key.slice(0, sep);
        const userId = key.slice(sep + 1);
        if (!guildId || !userId) continue;
        for (const [date, seconds] of Object.entries(dates || {})) {
          if (!(seconds > 0)) continue;
          if (merged.get(String(userId), String(guildId), date)) continue;
          insertStmt.run({ user_id: String(userId), guild_id: String(guildId), date, seconds });
          moved++;
        }
      }
    });
    tx();
    fs.renameSync(FB_FILE, archive);
    console.log(`[PeaceX] [vcTracker] Migrated ${moved} JSON record(s) into SQLite (backup: ${path.basename(archive)}).`);
  } catch (err) {
    console.warn(`[PeaceX] [vcTracker] JSON→SQLite migration skipped: ${err.message}`);
  }
}

// ── JSON fallback store: { "guildId:userId": { "YYYY-MM-DD": seconds } } ─
const FB_FILE = path.join(DATA_DIR, 'vc_tracker.json');

// Run after FB_FILE is defined (only migrates when SQLite is available).
migrateJsonFallbackIntoDb();

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
// Backed by data/vc_sessions.json so a restart never drops a live session.
const activeSessions = new Map();

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function persistSessions() {
  try {
    const payload = {};
    for (const [key, joinMs] of activeSessions) payload[key] = joinMs;
    fs.writeFileSync(SESSION_FILE, JSON.stringify(payload), 'utf8');
  } catch (err) {
    console.warn(`[PeaceX] [vcTracker] Failed to persist live sessions: ${err.message}`);
  }
}

function loadSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    for (const [key, joinMs] of Object.entries(raw)) {
      if (typeof joinMs === 'number' && Number.isFinite(joinMs) && joinMs > 0) {
        activeSessions.set(key, joinMs);
      }
    }
  } catch {
    /* no saved sessions yet */
  }
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
    persistSessions();
    return;
  }

  if (before && !after) {
    const joined = activeSessions.get(key);
    if (joined != null) {
      activeSessions.delete(key);
      persistSessions();
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
    persistSessions();
  }
}

/** Seed members already in voice at boot so restarts don't drop the session. */
function seedActiveSessions(client) {
  loadSessions();
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      const member = state.member;
      if (!state.channelId || !member || member.user?.bot) continue;
      const key = sessionKey(guild.id, member.id);
      if (!activeSessions.has(key)) activeSessions.set(key, now);
    }
  }
  persistSessions();
}

/**
 * Reconcile live sessions against the actual Discord client. Runs on an
 * interval to correct anything the gateway whispered about:
 *  - member in voice but not tracked (missed join / restart) -> start now
 *  - member tracked but no longer in voice (missed leave)      -> commit
 */
function reconcileSessions(client) {
  const now = Date.now();
  const seen = new Set();

  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      const member = state.member;
      if (!state.channelId || !member || member.user?.bot) continue;
      const key = sessionKey(guild.id, member.id);
      seen.add(key);
      if (!activeSessions.has(key)) activeSessions.set(key, now);
    }
  }

  let changed = false;
  for (const [key, joined] of activeSessions) {
    if (seen.has(key)) continue;
    const colon = key.indexOf(':');
    const guildId = key.slice(0, colon);
    const userId = key.slice(colon + 1);
    activeSessions.delete(key);
    changed = true;
    addTime(userId, guildId, (now - joined) / 1000);
  }

  if (changed || process.hrtime()[0] % 60 === 0) persistSessions();
}

/** Keep sessions synced with the live Discord client every LIVE_SYNC_MS. */
function startLiveSync(client) {
  const tick = () => {
    try {
      reconcileSessions(client);
    } catch (err) {
      console.warn(`[PeaceX] [vcTracker] Live sync failed: ${err.message}`);
    }
  };
  setInterval(tick, LIVE_SYNC_MS);
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

// ── Discord presence (accurate, client-fetched) ─────────────────────────
// The client caches presences lazily; asking it directly gives the real
// Online / Idle / DND / Offline state even if the member was never in cache.
function presenceLabel(status) {
  const map = {
    online: { dot: '🟢', label: 'Online' },
    idle: { dot: '🟡', label: 'Idle' },
    dnd: { dot: '🔴', label: 'Do Not Disturb' },
    offline: { dot: '⚫', label: 'Invisible' },
  };
  const entry = map[status] || map.offline;
  return `${entry.dot} ${entry.label}`;
}

async function fetchPresenceStatus(client, guildId, userId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return presenceLabel('offline');
    const member = await guild.members.fetch({ user: userId, withPresences: true }).catch(() => null);
    return presenceLabel(member?.presence?.status || 'offline');
  } catch {
    return presenceLabel('offline');
  }
}

/**
 * Verify the GUILD_PRESENCES privileged intent actually works. Enabling it
 * in code is not enough — it must also be approved in the Discord Developer
 * Portal. If approval is missing, Discord returns NO presence data at all and
 * the VC stats would silently show everyone as "Invisible". Detected here so
 * the owner sees a clear console warning at boot instead of wrong data.
 */
async function verifyPresenceIntent(client) {
  try {
    const guild = client.guilds.cache.find((g) => g.memberCount > 1);
    if (!guild) return;
    const probe = await guild.members.fetch({ limit: 5, withPresences: true }).catch(() => null);
    const hasData = probe?.some((m) => m.presence?.status && m.presence.status !== 'offline');
    if (hasData) {
      console.log('[PeaceX] [vcTracker] ✓ Presence intent OK — accurate Discord status will be shown.');
    } else {
      console.warn(
        '[PeaceX] [vcTracker] ✘ Presence data returned empty. The GUILD_PRESENCES intent is ENABLED in code ' +
          'but NOT APPROVED on the Discord Developer Portal (https://discord.com/developers/applications -> ' +
          'your app -> Bot). VC stats presence may show everyone as Invisible until you approve it.'
      );
    }
  } catch {
    /* verification is best-effort */
  }
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
  startLiveSync,
  verifyPresenceIntent,
  fetchPresenceStatus,
  getLiveSeconds,
  formatHMS,
  getUserStats,
  getGuildStats,
  generateWeeklyReport,
  splitMessage,
  startWeeklyReportScheduler,
};