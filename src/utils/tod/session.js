/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare module - session.js (Deliverable 4)
 *
 * Session lifecycle: lobby -> active -> ended. Illegal transitions throw
 * TypeError. Turn selection uses a shuffle bag (Fair Bag) that guarantees
 * every active player is picked before any active player is picked again.
 *
 * Public API:
 *   openLobby({ guildId, channelId, hostId, config }) -> session row
 *   join(sessionId, userId)                           -> { joined: bool }
 *   leave(sessionId, userId)                          -> bool
 *   start(sessionId)                                  -> session row (active)
 *   nextTurn(sessionId)                               -> { player, roundNo } | null
 *   endSession(sessionId, summaryObj)                 -> session row
 *   getSessionSafe(sessionId)                         -> session row | null
 *   isInLobby(sessionId)                              -> bool
 *   isActive(sessionId)                               -> bool
 *   sweepZombies(guildIds)                            -> count (boot hook)
 *
 * Boot contract: index.js / clientReady call sweepZombies on boot so no
 * 'lobby'|'active' session older than 6h survives a restart.
 */

'use strict';

const pino = require('pino');
const log = pino({
  name: 'peace-tod',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'peace-tod', developedBy: 'Smith.Code' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const store = require('./store');
const timers = require('./timers');

// sessionId -> array of user_ids (the shuffle bag; rebuilt when empty or
// when it no longer covers the active roster).
const bags = new Map();
// sessionId -> last user_id drawn (R2: never pick them back-to-back).
const lastPicked = new Map();
const ZOMBIE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function assertSessionRow(sessionId) {
  const session = store.getSession(sessionId);
  if (!session) throw new Error(`tod: session ${sessionId} does not exist`);
  return session;
}

function requireStatus(session, allowed) {
  if (!allowed.includes(session.status)) {
    throw new TypeError(
      `tod: illegal transition: session ${session.id} is '${session.status}', expected ${allowed.join(' | ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function openLobby({ guildId, channelId, hostId, config }) {
  const settings = JSON.stringify(config || {});
  const row = store.createSession({ guildId, channelId, hostId, settings });
  log.info({ sessionId: row.id, hostId }, 'tod lobby opened');
  bags.set(row.id, []);
  return row;
}

function join(sessionId, userId) {
  const session = assertSessionRow(sessionId);
  // Late join during lobby + active is allowed; ended is not.
  requireStatus(session, ['lobby', 'active']);
  return store.joinSession(sessionId, userId);
}

function leave(sessionId, userId) {
  assertSessionRow(sessionId);
  return store.leaveSession(sessionId, userId);
}

function start(sessionId) {
  const session = assertSessionRow(sessionId);
  requireStatus(session, ['lobby']);
  const row = store.startSession(sessionId);
  log.info({ sessionId }, 'tod session active');
  return row;
}

function nextTurn(sessionId) {
  const session = assertSessionRow(sessionId);
  requireStatus(session, ['active']);

  const players = store.listPlayers(sessionId);
  const activeIds = players.filter((p) => p.status === 'active').map((p) => p.user_id);
  if (activeIds.length === 0) return null;

  const rounds = store.listRounds(sessionId, 10000, 0);
  const lastRound = rounds[rounds.length - 1] || null;
  const roundNo = lastRound ? lastRound.round_no + 1 : 1;
  const prevUserId = lastPicked.get(sessionId) || null;

  let bag = bags.get(sessionId) || [];

  // Rebuild only when the bag is exhausted or no longer covers the roster;
  // a partially-consumed bag keeps its order so a full pass is completed
  // before anyone active is picked again (fairness: R2).
  const isStale = bag.length === 0 || bag.some((id) => !activeIds.includes(id));

  if (isStale) {
    // R2: the player drawn last goes LAST in the fresh bag, so no one is
    // picked twice in a row while other active players are waiting.
    const rotated = activeIds.filter((id) => id !== prevUserId);
    if (rotated.length === 0) {
      // single active player: nothing else to rotate
      bag = shuffle(activeIds);
    } else {
      bag = shuffle(rotated);
      bag.push(...activeIds.filter((id) => id === prevUserId));
    }
    bags.set(sessionId, bag);
  }

  const playerId = bag.shift();
  lastPicked.set(sessionId, playerId);
  bags.set(sessionId, bag);

  const player = players.find((p) => p.user_id === playerId);
  return { player, roundNo };
}

// Record who just occupied a turn without using the bag (game.js calls this
// when the first presenter opens a round), so the fair bag still knows not
// to re-draw them back-to-back (R2).
function notePick(sessionId, userId) {
  assertSessionRow(sessionId);
  lastPicked.set(sessionId, userId);
  return userId;
}

function endSession(sessionId, summaryObj) {
  assertSessionRow(sessionId);
  timers.cancelTimers(sessionId);
  const summaryJson = summaryObj ? JSON.stringify(summaryObj) : null;
  const row = store.endSession(sessionId, summaryJson);
  bags.delete(sessionId);
  log.info({ sessionId }, 'tod session ended');
  return row;
}

function sweepZombies(guildIds) {
  let count = 0;
  for (const guildId of guildIds) {
    count += store.endZombieSessions(guildId, ZOMBIE_MAX_AGE_MS);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function getSessionSafe(sessionId) {
  try {
    return store.getSession(sessionId) || null;
  } catch {
    return null;
  }
}

function isInLobby(sessionId) {
  const session = getSessionSafe(sessionId);
  return Boolean(session && session.status === 'lobby');
}

function isActive(sessionId) {
  const session = getSessionSafe(sessionId);
  return Boolean(session && session.status === 'active');
}

// ---------------------------------------------------------------------------
// Fair-bag shuffle (Fisher-Yates)
// ---------------------------------------------------------------------------

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = {
  openLobby,
  join,
  leave,
  start,
  nextTurn,
  notePick,
  endSession,
  sweepZombies,
  getSessionSafe,
  isInLobby,
  isActive,
};