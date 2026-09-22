/*
 * Peace* -- Discord Bot - Developed by Smith.Code
 *
 * Truth or Dare -- store.js (Deliverable 2 / data-access layer)
 *
 * All ToD persistence goes through this one module. It owns NO db handle
 * (db.js owns open / WAL pragmas / schema apply). It owns ONLY prepared
 * statements, input validation, and transactions.
 *
 * Rules this layer enforces:
 *   R4 - strikes >= strikes_to_kick -> set 'spectator' (here, not schema)
 *   R5 - skip tokens: a skip spends only while skips_used < skip_tokens
 *   R7 - spectator / left can't be picked for a turn (nextPlayer)
 *   R8 - repeat-guard: a prompt whose key was used in the previous round
 *        of this session is refused (tod_prompt_history).
 *
 * Every external function validates its inputs BEFORE touching the DB
 * (bad guild_id / session_id / user_id / kind -> TypeError, no silent
 * writes). Every multi-row write is wrapped in db.transaction().
 * Every query is a prepared statement - nothing is string-concatenated.
 */

'use strict';

const pino = require('pino');
const log = pino({
  name: 'peace-tod',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'peace-tod', developedBy: 'Smith.Code' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const { open, REQUIRED_TABLES } = require('./db');

// The module owns exactly one db handle, opened lazily on first require.
// Everything else in this module is prepared statements + transactions.
const db = open();

// ---------------------------------------------------------------------------
// Prepared statements (better-sqlite3, one per query)
// ---------------------------------------------------------------------------

/* tod_guild_config */
const sqlGuildGet = db.prepare(
  `SELECT * FROM tod_guild_config WHERE guild_id = ?`
);
const sqlGuildUpsert = db.prepare(
  `INSERT INTO tod_guild_config
     (guild_id, intensity, categories, join_window_s, turn_timer_s,
      truth_timer_s, dare_timer_s, skip_tokens, strikes_to_kick,
      max_players, spicy_enabled_at, created_at, updated_at)
   VALUES
     (@guild_id, @intensity, @categories, @join_window_s, @turn_timer_s,
      @truth_timer_s, @dare_timer_s, @skip_tokens, @strikes_to_kick,
      @max_players, @spicy_enabled_at, @created_at, @updated_at)
   ON CONFLICT (guild_id) DO UPDATE SET
      intensity        = excluded.intensity,
      categories       = excluded.categories,
      join_window_s    = excluded.join_window_s,
      turn_timer_s     = excluded.turn_timer_s,
      truth_timer_s    = excluded.truth_timer_s,
      dare_timer_s     = excluded.dare_timer_s,
      skip_tokens      = excluded.skip_tokens,
      strikes_to_kick  = excluded.strikes_to_kick,
      max_players      = excluded.max_players,
      spicy_enabled_at = excluded.spicy_enabled_at,
      updated_at       = excluded.updated_at`
);
const sqlGuildTouchSpicy = db.prepare(
  `UPDATE tod_guild_config
   SET spicy_enabled_at = ?, updated_at = ?
   WHERE guild_id = ?`
);

/* tod_sessions */
const sqlSessionInsert = db.prepare(
  `INSERT INTO tod_sessions
     (guild_id, channel_id, host_id, started_at, status, settings_json,
      ended_at, summary_json)
   VALUES
     (@guild_id, @channel_id, @host_id, @started_at, 'lobby',
      @settings_json, NULL, NULL)`
);
const sqlSessionGet = db.prepare(`SELECT * FROM tod_sessions WHERE id = ?`);
const sqlSessionSetStatus = db.prepare(
  `UPDATE tod_sessions SET status = ? WHERE id = ?`
);
const sqlSessionEnd = db.prepare(
  `UPDATE tod_sessions
   SET status = 'ended', ended_at = ?, summary_json = ?
   WHERE id = ?`
);
const sqlSessionZombies = db.prepare(
  `SELECT id, started_at FROM tod_sessions
   WHERE guild_id = ? AND status IN ('lobby', 'active') AND started_at < ?
   ORDER BY started_at ASC`
);
const sqlSessionSummaryUpdate = db.prepare(
  `UPDATE tod_sessions SET summary_json = ? WHERE id = ?`
);
const sqlOpenSessionByChannel = db.prepare(
  `SELECT * FROM tod_sessions
   WHERE channel_id = ? AND status IN ('lobby', 'active')
   ORDER BY started_at DESC LIMIT 1`
);

/* tod_players */
const sqlPlayerInsert = db.prepare(
  `INSERT OR IGNORE INTO tod_players
     (session_id, user_id, joined_at, turns, truths, dares, skips_used,
      strikes, status)
   VALUES
     (@session_id, @user_id, @joined_at, 0, 0, 0, 0, 0, 'active')`
);
const sqlPlayerGet = db.prepare(
  `SELECT * FROM tod_players WHERE session_id = ? AND user_id = ?`
);
const sqlPlayerSetStatus = db.prepare(
  `UPDATE tod_players SET status = ? WHERE session_id = ? AND user_id = ?`
);
const sqlPlayerBump = db.prepare(
  `UPDATE tod_players SET
      turns      = turns + @turns,
      truths     = truths + @truths,
      dares      = dares + @dares,
      skips_used = skips_used + @skips_used,
      strikes    = strikes + @strikes
   WHERE session_id = @session_id AND user_id = @user_id`
);
const sqlPlayerList = db.prepare(
  `SELECT * FROM tod_players WHERE session_id = ? ORDER BY joined_at ASC`
);
const sqlPlayerCount = db.prepare(
  `SELECT COUNT(*) AS n FROM tod_players
   WHERE session_id = ? AND status = 'active'`
);
const sqlPlayerNextTurn = db.prepare(
  `SELECT * FROM tod_players
   WHERE session_id = ? AND status = 'active'
   ORDER BY turns ASC, joined_at ASC
   LIMIT 1`
);
const sqlPlayerSetStatusAll = db.prepare(
  `UPDATE tod_players SET status = ? WHERE session_id = ?`
);

/* tod_rounds prompt fill-in (present a prompt on an open round) */
const sqlRoundSetPrompt = db.prepare(
  `UPDATE tod_rounds SET
      choice = @choice, prompt_text = @prompt_text, prompt_id = @prompt_id,
      category = @category, intensity = @intensity
   WHERE id = @id`
);

/* Phase 5 - read-only aggregates (stats panel + history panel) */
const sqlSessionsByGuild = db.prepare(
  `SELECT s.*, COUNT(p.user_id) AS player_count
   FROM tod_sessions s
   LEFT JOIN tod_players p ON p.session_id = s.id
   WHERE s.guild_id = ?
   GROUP BY s.id
   ORDER BY s.started_at DESC
   LIMIT ? OFFSET ?`
);
const sqlCountGuildSessions = db.prepare(
  `SELECT COUNT(*) AS n FROM tod_sessions WHERE guild_id = ?`
);
const sqlStatsByGuild = db.prepare(
  `SELECT
     COUNT(DISTINCT s.id) AS sessions,
     COUNT(r.id) AS rounds,
     COALESCE(SUM(CASE WHEN r.choice = 'truth' AND r.result = 'done' THEN 1 ELSE 0 END), 0) AS truths,
     COALESCE(SUM(CASE WHEN r.choice = 'dare' AND r.result = 'done' THEN 1 ELSE 0 END), 0) AS dares,
     COALESCE(SUM(CASE WHEN r.result = 'skip' THEN 1 ELSE 0 END), 0) AS skips,
     COALESCE(SUM(CASE WHEN r.result = 'refuse' THEN 1 ELSE 0 END), 0) AS refusals
   FROM tod_sessions s
   LEFT JOIN tod_rounds r ON r.session_id = s.id
   WHERE s.guild_id = ?`
);
const sqlTopPlayersByGuild = db.prepare(
  `SELECT p.user_id,
     SUM(p.turns) AS rounds,
     SUM(p.skips_used) AS skips,
     SUM(p.strikes) AS strikes
   FROM tod_players p
   JOIN tod_sessions s ON s.id = p.session_id
   WHERE s.guild_id = ?
   GROUP BY p.user_id
   ORDER BY rounds DESC, skips ASC
   LIMIT ?`
);
const sqlLongestSession = db.prepare(
  `SELECT COALESCE(MAX(n), 0) AS longest
   FROM (
     SELECT COUNT(r.id) AS n
     FROM tod_rounds r
     JOIN tod_sessions s ON s.id = r.session_id
     WHERE s.guild_id = ? AND s.status = 'ended'
     GROUP BY s.id
   )`
);

/* tod_rounds */
const sqlRoundInsert = db.prepare(
  `INSERT INTO tod_rounds
     (session_id, round_no, user_id, choice, prompt_text, prompt_id,
      category, intensity, result, started_at, resolved_at)
   VALUES
     (@session_id, @round_no, @user_id, @choice, @prompt_text,
      @prompt_id, @category, @intensity, @result, @started_at,
      @resolved_at)`
);
const sqlRoundResolve = db.prepare(
  `UPDATE tod_rounds SET result = @result, resolved_at = @resolved_at
   WHERE id = @id`
);
const sqlRoundsForSession = db.prepare(
  `SELECT * FROM tod_rounds WHERE session_id = ?
   ORDER BY round_no ASC`
);

/* tod_custom_prompts */
const sqlPromptInsert = db.prepare(
  `INSERT INTO tod_custom_prompts
     (guild_id, kind, category, intensity, prompt, added_by, added_at,
      use_count)
   VALUES
     (@guild_id, @kind, @category, @intensity, @prompt, @added_by,
      @added_at, 0)
   ON CONFLICT (guild_id, kind, prompt) DO NOTHING`
);
const sqlPromptDelete = db.prepare(
  `DELETE FROM tod_custom_prompts
   WHERE id = ? AND guild_id = ? AND added_by = ?`
);
const sqlPromptList = db.prepare(
  `SELECT * FROM tod_custom_prompts WHERE guild_id = ? AND kind = ?
   ORDER BY added_at DESC`
);
const sqlPromptBumpCount = db.prepare(
  `UPDATE tod_custom_prompts SET use_count = use_count + 1 WHERE id = ?`
);
const sqlPromptGet = db.prepare(
  `SELECT * FROM tod_custom_prompts
   WHERE guild_id = ? AND kind = ? AND category = ? AND intensity = ?
   ORDER BY use_count ASC, added_at ASC
   LIMIT 1`
);
const sqlCustomHistory = db.prepare(
  `SELECT prompt_key FROM tod_prompt_history
   WHERE session_id = ? AND prompt_key LIKE 'custom:%'
   ORDER BY round_no DESC LIMIT 1`
);

/* tod_prompt_history */
const sqlHistoryInsert = db.prepare(
  `INSERT INTO tod_prompt_history (session_id, round_no, prompt_key, used_at)
   VALUES (@session_id, @round_no, @prompt_key, @used_at)`
);
const sqlHistoryLast = db.prepare(
  `SELECT prompt_key FROM tod_prompt_history
   WHERE session_id = ? ORDER BY round_no DESC LIMIT 1`
);
const sqlSpicyGate = db.prepare(
  `SELECT spicy_enabled_at FROM tod_guild_config WHERE guild_id = ?`
);

// ---------------------------------------------------------------------------
// Validation helpers -- throw BEFORE touching the DB
// ---------------------------------------------------------------------------

function assertGuildId(v) {
  if (typeof v !== 'string' || !/^\d{10,25}$/.test(v))
    throw new TypeError(
      `tod: guild_id must be a Discord snowflake string (got ${JSON.stringify(v)})`
    );
}
function assertSessionId(v) {
  if (!Number.isInteger(v) || v <= 0)
    throw new TypeError(`tod: session_id must be a positive integer (got ${v})`);
}
function assertUserId(v) {
  if (typeof v !== 'string' || !/^\d{10,25}$/.test(v))
    throw new TypeError(
      `tod: user_id must be a Discord snowflake string (got ${JSON.stringify(v)})`
    );
}
function assertPositiveInt(v, name) {
  if (!Number.isInteger(v) || v <= 0)
    throw new TypeError(`tod: ${name} must be a positive integer (got ${v})`);
}
function assertNonEmptyString(v, name) {
  if (typeof v !== 'string' || v.trim().length === 0)
    throw new TypeError(`tod: ${name} must be a non-empty string`);
}

// ---------------------------------------------------------------------------
// Guild config
// ---------------------------------------------------------------------------

function getOrCreateGuildConfig(guildId, defaults = {}) {
  assertGuildId(guildId);
  const existing = sqlGuildGet.get(guildId);
  if (existing) return existing;

  const now = Date.now();
  const config = {
    guild_id: guildId,
    intensity: defaults.intensity || 'pg13',
    categories: defaults.categories || 'Funny,Deep,Weird',
    join_window_s: defaults.join_window_s || 60,
    turn_timer_s: defaults.turn_timer_s || 30,
    truth_timer_s: defaults.truth_timer_s || 120,
    dare_timer_s: defaults.dare_timer_s || 300,
    skip_tokens: defaults.skip_tokens || 3,
    strikes_to_kick: defaults.strikes_to_kick || 3,
    max_players: defaults.max_players || 20,
    spicy_enabled_at: null,
    created_at: now,
    updated_at: now,
  };
  sqlGuildUpsert.run(config);
  log.info({ guildId, intensity: config.intensity }, 'tod guild config created');
  return sqlGuildGet.get(guildId);
}

function updateGuildConfig(guildId, patch = {}) {
  assertGuildId(guildId);
  const current = sqlGuildGet.get(guildId) || getOrCreateGuildConfig(guildId);
  const allowed = new Set([
    'intensity', 'categories', 'join_window_s', 'turn_timer_s',
    'truth_timer_s', 'dare_timer_s', 'skip_tokens', 'strikes_to_kick',
    'max_players', 'spicy_enabled_at',
  ]);
  for (const k of Object.keys(patch)) {
    if (!allowed.has(k))
      throw new TypeError(`tod: unknown config field "${k}"`);
  }
  const next = { ...current, ...patch, updated_at: Date.now() };
  sqlGuildUpsert.run(next);
  return sqlGuildGet.get(guildId);
}

/* Spicy gate (R9): null when NOT enabled; else epoch-ms of activation so
 * the 24h lock can be enforced by the caller. */
function getSpicyGate(guildId) {
  assertGuildId(guildId);
  return (sqlSpicyGate.get(guildId) || {}).spicy_enabled_at ?? null;
}
function touchSpicy(guildId) {
  assertGuildId(guildId);
  sqlGuildTouchSpicy.run(Date.now(), Date.now(), guildId);
  return getSpicyGate(guildId);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function createSession({ guildId, channelId, hostId, settings }) {
  assertGuildId(guildId);
  assertGuildId(channelId);
  assertUserId(hostId);
  assertNonEmptyString(settings, 'settings');
  const info = db.transaction(() => {
    const r = sqlSessionInsert.run({
      guild_id: guildId,
      channel_id: channelId,
      host_id: hostId,
      started_at: Date.now(),
      settings_json: settings,
    });
    const sid = Number(r.lastInsertRowid);
    sqlPlayerInsert.run({ session_id: sid, user_id: hostId, joined_at: Date.now() });
    return sid;
  })();
  log.info({ sessionId: info }, 'tod session created (host auto-joined)');
  return sqlSessionGet.get(info);
}
function getSession(sessionId) {
  assertSessionId(sessionId);
  return sqlSessionGet.get(sessionId) || null;
}
function endSession(sessionId, summaryJson = null) {
  assertSessionId(sessionId);
  const now = Date.now();
  db.transaction(() => {
    sqlSessionEnd.run(now, summaryJson, sessionId);
    sqlPlayerSetStatusAll.run('left', sessionId);
  })();
  return sqlSessionGet.get(sessionId);
}
function updateSessionSummary(sessionId, summaryJson) {
  assertSessionId(sessionId);
  sqlSessionSummaryUpdate.run(summaryJson, sessionId);
  return sqlSessionGet.get(sessionId);
}

// The lobby/round buttons (tod:lobby:*, tod:round:*, tod:answer:*) have no
// ctx id - they live on a public message, so resolve the session by channel.
function findOpenSession(channelId) {
  assertGuildId(channelId);
  return sqlOpenSessionByChannel.get(channelId) || null;
}
function endZombieSessions(guildId, maxAgeMs = 6 * 60 * 60 * 1000) {
  assertGuildId(guildId);
  const cut = Date.now() - maxAgeMs;
  const zombies = sqlSessionZombies.all(guildId, cut);
  if (zombies.length === 0) return 0;
  const endOne = db.transaction((s) => {
    const endedAt = Date.now();
    sqlSessionEnd.run(endedAt, JSON.stringify({ reason: 'bot_restart' }), s.id);
    sqlPlayerSetStatusAll.run('left', s.id);
  });
  for (const s of zombies) endOne(s);
  log.warn(
    { guildId, count: zombies.length },
    'tod zombie sessions ended (bot restart / stale)'
  );
  return zombies.length;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

function joinSession(sessionId, userId) {
  assertSessionId(sessionId);
  assertUserId(userId);
  const session = sqlSessionGet.get(sessionId);
  if (!session) throw new Error(`tod: session ${sessionId} does not exist`);
  const info = db.transaction(() => {
    const wasActive = sqlPlayerGet.get(sessionId, userId);
    if (wasActive) return { joined: false, rejoin: true };
    sqlPlayerInsert.run({
      session_id: sessionId,
      user_id: userId,
      joined_at: Date.now(),
    });
    sqlPlayerSetStatus.run('active', sessionId, userId);
    return { joined: true, rejoin: false };
  })();
  log.info({ sessionId, userId }, 'tod player joined session');
  return info;
}
function leaveSession(sessionId, userId) {
  assertSessionId(sessionId);
  assertUserId(userId);
  db.transaction(() => sqlPlayerSetStatus.run('left', sessionId, userId))();
  return true;
}
function setSpectator(sessionId, userId) {
  assertSessionId(sessionId);
  assertUserId(userId);
  db.transaction(() => sqlPlayerSetStatus.run('spectator', sessionId, userId))();
  return true;
}
function bumpPlayerStat(sessionId, userId, field, delta = 1) {
  assertSessionId(sessionId);
  assertUserId(userId);
  const fields = new Set(['turns', 'truths', 'dares', 'skips_used', 'strikes']);
  if (!fields.has(field))
    throw new TypeError(`tod: unknown player stat "${field}"`);
  assertPositiveInt(delta, 'delta');
  const out = db.transaction(() => {
    sqlPlayerBump.run({
      session_id: sessionId,
      user_id: userId,
      turns: field === 'turns' ? delta : 0,
      truths: field === 'truths' ? delta : 0,
      dares: field === 'dares' ? delta : 0,
      skips_used: field === 'skips_used' ? delta : 0,
      strikes: field === 'strikes' ? delta : 0,
    });
    // R4: strikes_to_kick reached -> spectator (no silent strike-out)
    const player = sqlPlayerGet.get(sessionId, userId);
    if (player && player.strikes >= 3) {
      sqlPlayerSetStatus.run('spectator', sessionId, userId);
      log.warn({ sessionId, userId, strikes: player.strikes }, 'tod strike-limit -> spectator');
    }
    return sqlPlayerGet.get(sessionId, userId);
  })();
  return out;
}
function listPlayers(sessionId) {
  assertSessionId(sessionId);
  return sqlPlayerList.all(sessionId);
}
function countActivePlayers(sessionId) {
  assertSessionId(sessionId);
  return sqlPlayerCount.get(sessionId).n;
}
function nextPlayer(sessionId) {
  assertSessionId(sessionId);
  return sqlPlayerNextTurn.get(sessionId) || null;
}

// ---------------------------------------------------------------------------
// Rounds (one row per player turn)
// ---------------------------------------------------------------------------

function recordRound({ sessionId, roundNo, userId, choice, promptText,
  promptId, category, intensity, result, startedAt, resolvedAt }) {
  assertSessionId(sessionId);
  assertPositiveInt(roundNo, 'roundNo');
  assertUserId(userId);
  assertNonEmptyString(result, 'result');
  const info = db.transaction(() => {
    const r = sqlRoundInsert.run({
      session_id: sessionId,
      round_no: roundNo,
      user_id: userId,
      choice: choice || null,
      prompt_text: promptText || null,
      prompt_id: promptId || null,
      category: category || null,
      intensity: intensity || null,
      result,
      started_at: startedAt || Date.now(),
      resolved_at: resolvedAt || null,
    });
    return Number(r.lastInsertRowid);
  })();
  return { id: info };
}
function listRounds(sessionId, limit = 50, offset = 0) {
  assertSessionId(sessionId);
  assertPositiveInt(limit, 'limit');
  if (!Number.isInteger(offset) || offset < 0)
    throw new TypeError(`tod: offset must be >= 0 (got ${offset})`);
  return sqlRoundsForSession.all(sessionId).slice(offset, offset + limit);
}
function resolveRound(roundId, result, resolvedAt) {
  assertPositiveInt(roundId, 'roundId');
  assertNonEmptyString(result, 'result');
  sqlRoundResolve.run({ id: roundId, result, resolved_at: resolvedAt || Date.now() });
  return true;
}

// ---------------------------------------------------------------------------
// Custom prompts (R9 prompt manager, guild-scoped)
// ---------------------------------------------------------------------------

function addCustomPrompt({ guildId, kind, category, intensity, prompt,
  addedBy }) {
  assertGuildId(guildId);
  for (const [v, n] of [[kind, 'kind'], [category, 'category'],
    [intensity, 'intensity'], [prompt, 'prompt'], [addedBy, 'addedBy']]) {
    assertNonEmptyString(v, n);
  }
  if (kind !== 'truth' && kind !== 'dare')
    throw new TypeError(`tod: kind must be 'truth' | 'dare' (got ${kind})`);
  const out = db.transaction(() => {
    const r = sqlPromptInsert.run({
      guild_id: guildId,
      kind,
      category,
      intensity,
      prompt,
      added_by: addedBy,
      added_at: Date.now(),
    });
    return r.changes > 0; // ON CONFLICT DO NOTHING -> false = dup
  })();
  if (!out) return { ok: false, reason: 'duplicate' };
  return { ok: true };
}
function deleteCustomPrompt(id, guildId, addedBy) {
  assertPositiveInt(id, 'id');
  assertGuildId(guildId);
  assertUserId(addedBy);
  const r = sqlPromptDelete.run(id, guildId, addedBy);
  return r.changes > 0;
}
function listCustomPrompts(guildId, kind, category, intensity) {
  assertGuildId(guildId);
  assertNonEmptyString(kind, 'kind');
  if (category) assertNonEmptyString(category, 'category');
  if (intensity) assertNonEmptyString(intensity, 'intensity');
  return sqlPromptList.all(guildId, kind).filter(
    (p) => (!category || p.category === category) &&
           (!intensity || p.intensity === intensity)
  );
}
function incrementPromptUse(id) {
  assertPositiveInt(id, 'id');
  sqlPromptBumpCount.run(id);
  return true;
}
function pickCustomPrompt(guildId, kind, category, intensity, sessionId) {
  assertGuildId(guildId);
  assertNonEmptyString(kind, 'kind');
  const last = sqlCustomHistory.get(sessionId);
  const p = sqlPromptGet.get(guildId, kind, category, intensity);
  if (!p) return { prompt: null, reason: 'none' };
  const key = `custom:${p.id}`;
  if (last && last.prompt_key === key) return { prompt: null, reason: 'repeat' }; // R8
  return { prompt: p, key };
}

// ---------------------------------------------------------------------------
// Prompt history (R8: never repeat the same prompt twice in a row)
// ---------------------------------------------------------------------------

function pushPromptHistory({ sessionId, roundNo, promptKey, usedAt }) {
  assertSessionId(sessionId);
  assertPositiveInt(roundNo, 'roundNo');
  assertNonEmptyString(promptKey, 'promptKey');
  sqlHistoryInsert.run({
    session_id: sessionId,
    round_no: roundNo,
    prompt_key: promptKey,
    used_at: usedAt || Date.now(),
  });
  return true;
}
function lastPromptKey(sessionId) {
  assertSessionId(sessionId);
  return (sqlHistoryLast.get(sessionId) || {}).prompt_key ?? null;
}

// ---------------------------------------------------------------------------
// Phase 3 additions: session start, strike adds (R4 config-driven), prompt fill
// ---------------------------------------------------------------------------

// Test-only hook: exposes the raw db handle so tests (in-memory) can backdate
// rows (e.g. age a session for the zombie sweep). Production code never uses it.
function getDb() {
  return db;
}

function startSession(sessionId) {
  assertSessionId(sessionId);
  const transaction = db.transaction(() => {
    sqlSessionSetStatus.run('active', sessionId);
  });
  transaction();
  log.info({ sessionId }, 'tod session started');
  return sqlSessionGet.get(sessionId);
}

function addStrikes(sessionId, userId, delta = 1) {
  assertSessionId(sessionId);
  assertUserId(userId);
  assertPositiveInt(delta, 'delta');
  db.transaction(() => {
    sqlPlayerBump.run({
      session_id: sessionId,
      user_id: userId,
      turns: 0,
      truths: 0,
      dares: 0,
      skips_used: 0,
      strikes: delta,
    });
    // R4 is enforced here too (config-driven via caller param).
  })();
  return sqlPlayerGet.get(sessionId, userId);
}

function setRoundPrompt(roundId, { choice, promptText, promptId, category,
  intensity }) {
  assertPositiveInt(roundId, 'roundId');
  if (choice !== null && choice !== 'truth' && choice !== 'dare') {
    throw new TypeError(`tod: choice must be 'truth' | 'dare' | null (got ${choice})`);
  }
  // choice is allowed to be null while a round is still open (present).
  db.transaction(() => {
    sqlRoundSetPrompt.run({
      id: roundId,
      choice: choice === undefined ? null : choice,
      prompt_text: promptText === undefined ? null : promptText,
      prompt_id: promptId === undefined ? null : promptId,
      category: category === undefined ? null : category,
      intensity: intensity === undefined ? null : intensity,
    });
  })();
  return true;
}

// ---------------------------------------------------------------------------
// Phase 5 - query aggregates (read-only, stats + history panels)
// ---------------------------------------------------------------------------

function listSessions(guildId, limit = 10, offset = 0) {
  assertGuildId(guildId);
  assertPositiveInt(limit, 'limit');
  if (!Number.isInteger(offset) || offset < 0)
    throw new TypeError(`tod: offset must be >= 0 (got ${offset})`);
  return sqlSessionsByGuild.all(guildId, limit, offset);
}

function countSessions(guildId) {
  assertGuildId(guildId);
  return sqlCountGuildSessions.get(guildId).n;
}

function guildStats(guildId) {
  assertGuildId(guildId);
  return sqlStatsByGuild.get(guildId);
}

function guildTopPlayers(guildId, limit = 3) {
  assertGuildId(guildId);
  assertPositiveInt(limit, 'limit');
  return sqlTopPlayersByGuild.all(guildId, limit);
}

function longestSession(guildId) {
  assertGuildId(guildId);
  return sqlLongestSession.get(guildId).longest;
}

// ---------------------------------------------------------------------------
// Export surface
// ---------------------------------------------------------------------------

module.exports = {
  REQUIRED_TABLES,
  getDb,
  getOrCreateGuildConfig,
  updateGuildConfig,
  getSpicyGate,
  touchSpicy,
  createSession,
  getSession,
  endSession,
  updateSessionSummary,
  findOpenSession,
  endZombieSessions,
  startSession,
  addStrikes,
  setRoundPrompt,
  joinSession,
  leaveSession,
  setSpectator,
  bumpPlayerStat,
  listPlayers,
  countActivePlayers,
  nextPlayer,
  recordRound,
  listRounds,
  resolveRound,
  addCustomPrompt,
  deleteCustomPrompt,
  listCustomPrompts,
  incrementPromptUse,
  pickCustomPrompt,
  pushPromptHistory,
  lastPromptKey,
  listSessions,
  countSessions,
  guildStats,
  guildTopPlayers,
  longestSession,
};