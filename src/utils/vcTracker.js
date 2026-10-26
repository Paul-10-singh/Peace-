/*
 * PeaceΓ£ÿ - Discord Bot
 * Developed by Smith.Code
 *
 * Voice-channel activity tracker (ported from the Vybe Γ£ÿ build).
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
const { EmbedBuilder } = require('discord.js');
const { BRAND, footer } = require('./decorations');

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

// ΓöÇΓöÇ Date helpers (local time, matching the original build) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ SQLite store ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
  console.warn(`[PeaceX] [vcTracker] SQLite binding unavailable (${err.message}) ΓÇö using JSON fallback.`);
}

// ΓöÇΓöÇ One-time migration: fold the JSON fallback store into SQLite ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
    console.warn(`[PeaceX] [vcTracker] JSONΓåÆSQLite migration skipped: ${err.message}`);
  }
}

// ΓöÇΓöÇ JSON fallback store: { "guildId:userId": { "YYYY-MM-DD": seconds } } ΓöÇ
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

// ΓöÇΓöÇ Active sessions: Map<`${guildId}:${userId}`, joinMs> ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

/**
 * Builds sleek, paginated Discord embeds for the weekly VC activity report.
 * Each member entry includes:
 *  - Rank medal / number (🥇, 🥈, 🥉, #04, ...)
 *  - Display name and clickable <@userId> mention
 *  - Explicit User ID in backticks (`userId`)
 *  - Formatted VC time (`HH:MM:SS`)
 *  - ACTIVE / INACTIVE status badge with custom server emoji
 *
 * @param {import('discord.js').Guild} guild
 * @param {number} daysOffset
 * @param {object} options
 * @returns {Promise<EmbedBuilder[]>}
 */
async function buildWeeklyReportEmbeds(guild, daysOffset = 0, options = {}) {
  const { startDate, endDate } = getWeekRange(daysOffset);
  const recorded = getGuildStats(guild.id, startDate, endDate);

  // Combine recorded time + any ongoing live VC time for this week
  const totals = new Map(recorded);
  if (daysOffset === 0 && guild.voiceStates?.cache) {
    for (const vs of guild.voiceStates.cache.values()) {
      if (vs.member?.id && !vs.member.user?.bot) {
        const live = getLiveSeconds(vs.member.id, guild.id);
        if (live > 0) {
          totals.set(vs.member.id, (totals.get(vs.member.id) || 0) + live);
        }
      }
    }
  }

  const rows = [...totals.entries()]
    .filter(([userId, sec]) => userId && sec > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!rows.length) return [];

  // Try fetching uncached guild members so display names are accurate
  if (guild.members?.fetch && (!guild.members.cache || guild.members.cache.size < rows.length)) {
    try {
      await guild.members.fetch().catch(() => {});
    } catch {}
  }

  const label = daysOffset === 0 ? 'This Week' : 'Last Week';
  const activeCount = rows.filter(([, s]) => s >= WEEKLY_GOAL_HOURS * 3600).length;
  const inactiveCount = rows.length - activeCount;
  const totalSecondsSum = rows.reduce((acc, [, s]) => acc + s, 0);

  // Build formatted cards for each member
  const memberCards = rows.map(([userId, totalSeconds], i) => {
    const member = guild.members?.cache?.get(String(userId));
    const rawName = member
      ? (member.displayName || member.user?.username)
      : (options.client?.users?.cache?.get(String(userId))?.username || 'Member');
    const cleanName = String(rawName).replace(/\*\*/g, '');
    const timeStr = formatHMS(totalSeconds);
    const isActive = totalSeconds >= WEEKLY_GOAL_HOURS * 3600;
    const status = isActive ? `**ACTIVE** ${E.correct}` : `**INACTIVE** ${E.wrong}`;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ('`#' + String(i + 1).padStart(2, '0') + '`');

    return `${medal} **${cleanName}** (<@${userId}>)\n   🆔 \`${userId}\` ┆ ⏱️ \`${timeStr}\` ┆ ${status}`;
  });

  // Group into pages of 10 members for clean vertical spacing
  const MEMBERS_PER_PAGE = 10;
  const totalPages = Math.ceil(memberCards.length / MEMBERS_PER_PAGE) || 1;
  const embeds = [];

  for (let page = 0; page < totalPages; page++) {
    const pageItems = memberCards.slice(page * MEMBERS_PER_PAGE, (page + 1) * MEMBERS_PER_PAGE);
    const embed = new EmbedBuilder()
      .setColor(BRAND?.primary || 0x353535)
      .setTimestamp();

    if (guild.iconURL) {
      const icon = guild.iconURL({ dynamic: true });
      if (icon) embed.setThumbnail(icon);
    }

    const titlePrefix = options.isSundayReport
      ? `${E.owner} Sunday VC Activity Report`
      : `${E.weeklychart} Weekly VC Activity Report`;
    embed.setTitle(`${titlePrefix} — ${guild.name}`);

    const descLines = [];
    if (page === 0) {
      descLines.push(
        `### 📊 **WEEKLY VC ACTIVITY CHART (${label.toUpperCase()})**`,
        `🗓️ **Period:** \`${startDate}\` to \`${endDate}\``,
        `🎯 **Target Goal:** \`${WEEKLY_GOAL_HOURS} Hours\` to be **ACTIVE**`,
        `👥 **Total Tracked:** \`${rows.length}\` members ┆ ⏱️ **Total VC Time:** \`${formatHMS(totalSecondsSum)}\``,
        `🟢 **Active (Goal Met):** \`${activeCount}\` ┆ 🔴 **Inactive:** \`${inactiveCount}\``,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        ''
      );
    } else {
      descLines.push(`*(Continued from Page ${page})*`, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '');
    }

    descLines.push(pageItems.join('\n\n'));
    embed.setDescription(descLines.join('\n'));

    const botAvatar = options.client?.user?.displayAvatarURL?.({ dynamic: true }) || null;
    const footerText = totalPages > 1
      ? `Page ${page + 1} of ${totalPages} • ${rows.length} Members Tracked`
      : `${rows.length} Members Tracked`;
    embed.setFooter(footer(footerText, botAvatar));

    embeds.push(embed);
  }

  return embeds;
}
/**
 * Clean formatted text report, including User IDs and Discord mentions.
 * Used as a fallback or for text-only contexts.
 */
function generateWeeklyReport(guild, daysOffset = 0) {
  const { startDate, endDate } = getWeekRange(daysOffset);
  const rows = getGuildStats(guild.id, startDate, endDate).sort((a, b) => b[1] - a[1]);

  if (!rows.length) return 'No voice chat activity recorded for this period.';

  const label = daysOffset === 0 ? 'THIS WEEK' : 'LAST WEEK';
  const activeCount = rows.filter(([, s]) => s >= WEEKLY_GOAL_HOURS * 3600).length;
  const inactiveCount = rows.length - activeCount;
  const totalSecondsSum = rows.reduce((acc, [, s]) => acc + s, 0);

  const lines = [
    `${E.weeklychart} **WEEKLY VC ACTIVITY CHART (${label})**`,
    `${E.period} **Period:** \`${startDate}\` to \`${endDate}\``,
    `${E.target} **Target Goal:** \`${WEEKLY_GOAL_HOURS} Hours\` to be **ACTIVE**`,
    `👥 **Total Tracked:** \`${rows.length}\` members ┆ ⏱️ **Total VC Time:** \`${formatHMS(totalSecondsSum)}\``,
    `🟢 **Active:** \`${activeCount}\` ┆ 🔴 **Inactive:** \`${inactiveCount}\``,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ];

  for (let i = 0; i < rows.length; i++) {
    const [userId, totalSeconds] = rows[i];
    const member = guild.members?.cache?.get(String(userId));
    const rawName = member ? (member.displayName || member.user?.username) : `User ${userId}`;
    const cleanName = String(rawName).replace(/\*\*/g, '');
    const timeStr = formatHMS(totalSeconds);
    const isActive = totalSeconds >= WEEKLY_GOAL_HOURS * 3600;
    const status = isActive ? `**ACTIVE** ${E.correct}` : `**INACTIVE** ${E.wrong}`;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ('`#' + String(i + 1).padStart(2, '0') + '`');

    lines.push(`${medal} **${cleanName}** (<@${userId}>)`);
    lines.push(`   🆔 \`${userId}\` ┆ ⏱️ \`${timeStr}\` ┆ ${status}\n`);
  }

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

// ΓöÇΓöÇ Discord presence (accurate, client-fetched) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// The client caches presences lazily; asking it directly gives the real
// Online / Idle / DND / Offline state even if the member was never in cache.
function presenceLabel(status) {
  const map = {
    online: { dot: '≡ƒƒó', label: 'Online' },
    idle: { dot: '≡ƒƒí', label: 'Idle' },
    dnd: { dot: '≡ƒö┤', label: 'Do Not Disturb' },
    offline: { dot: 'ΓÜ½', label: 'Invisible' },
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
 * in code is not enough ΓÇö it must also be approved in the Discord Developer
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
      console.log('[PeaceX] [vcTracker] Γ£ô Presence intent OK ΓÇö accurate Discord status will be shown.');
    } else {
      console.warn(
        '[PeaceX] [vcTracker] Γ£ÿ Presence data returned empty. The GUILD_PRESENCES intent is ENABLED in code ' +
          'but NOT APPROVED on the Discord Developer Portal (https://discord.com/developers/applications -> ' +
          'your app -> Bot). VC stats presence may show everyone as Invisible until you approve it.'
      );
    }
  } catch {
    /* verification is best-effort */
  }
}

// ── Automated Sunday report (11 PM, DMs each guild's owner) ───────────────────
async function sendSundayWeeklyReports(client, options = {}) {
  const { targetGuildId = null } = options;
  const results = {
    totalGuilds: 0,
    deliveredToOwnerDm: [],
    fallbackToChannel: [],
    noActivity: [],
    failed: [],
  };

  const guilds = targetGuildId
    ? [client.guilds.cache.get(targetGuildId)].filter(Boolean)
    : [...client.guilds.cache.values()];

  results.totalGuilds = guilds.length;

  for (const guild of guilds) {
    try {
      let owner = guild.members?.cache?.get(guild.ownerId);
      if (!owner && typeof guild.fetchOwner === 'function') {
        try {
          owner = await guild.fetchOwner();
        } catch {}
      }
      if (!owner && guild.ownerId && typeof client.users?.fetch === 'function') {
        try {
          owner = await client.users.fetch(guild.ownerId);
        } catch {}
      }

      const embeds = await (module.exports.buildWeeklyReportEmbeds || buildWeeklyReportEmbeds)(guild, 0, { isSundayReport: true, client });
      if (!embeds.length) {
        results.noActivity.push({ id: guild.id, name: guild.name });
        continue;
      }

      let dmSuccess = false;
      if (owner) {
        try {
          for (let i = 0; i < embeds.length; i += 10) {
            await owner.send({ embeds: embeds.slice(i, i + 10) });
          }
          dmSuccess = true;
          results.deliveredToOwnerDm.push({ id: guild.id, name: guild.name, ownerId: guild.ownerId });
        } catch (dmErr) {
          console.warn(`[PeaceX] [vcTracker] Failed to DM embed report to owner of ${guild.name} (${dmErr.message}). Trying text fallback...`);
          try {
            const chart = generateWeeklyReport(guild, 0);
            const chunks = splitMessage(`${E.owner} **Sunday VC Activity Report for ${guild.name}**\n\n${chart}`);
            for (const chunk of chunks) await owner.send(chunk);
            dmSuccess = true;
            results.deliveredToOwnerDm.push({ id: guild.id, name: guild.name, ownerId: guild.ownerId });
          } catch (textErr) {
            console.warn(`[PeaceX] [vcTracker] Failed to DM owner of ${guild.name} via text fallback too: ${textErr.message}`);
          }
        }
      }

      // If DM failed (e.g. server owner DMs are closed), deliver to a fallback text channel in the guild
      if (!dmSuccess) {
        let channel = null;
        const me = guild.members?.me || client.user;
        const perms = ['SendMessages', 'EmbedLinks', 'ViewChannel'];

        if (guild.systemChannel && guild.systemChannel.permissionsFor?.(me)?.has(perms)) {
          channel = guild.systemChannel;
        }

        if (!channel && guild.channels?.cache) {
          channel = guild.channels.cache.find(
            (c) =>
              c.isTextBased?.() &&
              !c.isVoiceBased?.() &&
              !c.isThread?.() &&
              c.permissionsFor?.(me)?.has(perms)
          );
        }

        if (channel) {
          try {
            const note = `ℹ️ **Sunday VC Activity Report** for **${guild.name}**\n*(Note: Could not deliver to server owner <@${guild.ownerId}> via DM because their Direct Messages are closed.)*`;
            await channel.send({ content: note, embeds: embeds.slice(0, 10) });
            for (let i = 10; i < embeds.length; i += 10) {
              await channel.send({ embeds: embeds.slice(i, i + 10) });
            }
            results.fallbackToChannel.push({ id: guild.id, name: guild.name, channelId: channel.id });
          } catch (chErr) {
            console.error(`[PeaceX] [vcTracker] Fallback channel send failed for ${guild.name}: ${chErr.message}`);
            results.failed.push({ id: guild.id, name: guild.name, reason: chErr.message });
          }
        } else {
          results.failed.push({ id: guild.id, name: guild.name, reason: 'DMs closed and no accessible channel found' });
        }
      }
    } catch (guildErr) {
      console.error(`[PeaceX] [vcTracker] Error generating weekly report for ${guild.name}:`, guildErr);
      results.failed.push({ id: guild.id, name: guild.name, reason: guildErr.message });
    }
  }

  // Send consolidated dispatch summary to Global Bot Owner(s)
  if (!targetGuildId && (results.deliveredToOwnerDm.length > 0 || results.fallbackToChannel.length > 0 || results.failed.length > 0)) {
    try {
      const { getBotOwnerIds } = require('./owners');
      const botOwnerIds = getBotOwnerIds();

      const summaryEmbed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('📊 Weekly Sunday VC Report — Dispatch Summary')
        .setDescription(
          `Automated Sunday weekly voice reports have been processed across all servers:\n\n` +
          `🌐 **Total Servers:** \`${results.totalGuilds}\`\n` +
          `📬 **Delivered to Server Owner DM:** \`${results.deliveredToOwnerDm.length}\`\n` +
          `📢 **Delivered to Fallback Channel (DMs Closed):** \`${results.fallbackToChannel.length}\`\n` +
          `💤 **No VC Activity:** \`${results.noActivity.length}\`\n` +
          `⚠️ **Failed:** \`${results.failed.length}\``
        )
        .setTimestamp();

      if (results.deliveredToOwnerDm.length > 0) {
        summaryEmbed.addFields({
          name: '📬 Delivered to Owner DMs',
          value: results.deliveredToOwnerDm.slice(0, 15).map((g) => `• **${g.name}** (<@${g.ownerId}>)`).join('\n') || 'None',
        });
      }

      if (results.fallbackToChannel.length > 0) {
        summaryEmbed.addFields({
          name: '📢 Delivered to Fallback Channels',
          value: results.fallbackToChannel.slice(0, 10).map((g) => `• **${g.name}** (<#${g.channelId}>)`).join('\n') || 'None',
        });
      }

      for (const botOwnerId of botOwnerIds) {
        try {
          if (typeof client.users?.fetch === 'function') {
            const user = await client.users.fetch(botOwnerId);
            if (user && typeof user.send === 'function') {
              await user.send({ embeds: [summaryEmbed] });
            }
          }
        } catch {}
      }
    } catch (botOwnerErr) {
      console.warn('[PeaceX] [vcTracker] Failed to send dispatch summary to Bot Owner:', botOwnerErr.message);
    }
  }

  return results;
}

function startWeeklyReportScheduler(client) {
  const tick = async () => {
    const now = new Date();
    if (now.getDay() !== 0 || now.getHours() !== 23) return; // Sunday 23:00

    const stamp = `${toDateStr(now)}T${now.getHours()}`;
    if (client._vcReportStamp === stamp) return;
    client._vcReportStamp = stamp;

    await sendSundayWeeklyReports(client);
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
  buildWeeklyReportEmbeds,
  splitMessage,
  sendSundayWeeklyReports,
  startWeeklyReportScheduler,
};
