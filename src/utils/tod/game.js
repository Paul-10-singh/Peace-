/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare module - game.js (Deliverable 4)
 *
 * Turn orchestration on top of session.js + store + prompts.
 *
 * Rules enforced here (store enforces its own layer):
 *   R1  only the current turn owner may act
 *   R2  no same-user-twice-in-a-row (fair-bag rotation in session.js)
 *   R4  strikes >= strikes_to_kick -> spectator
 *   R5  skip tokens bounded by config.skip_tokens
 *   R8  a prompt already used as the last prompt_key is never re-served
 *   R9  spicy prompts only when the guild gate unlocks them
 *
 * Turn model: game.js keeps an in-memory "currentTurn" per session
 *   current = { userId, roundId, roundNo } - the player currently acting.
 * presentChoice opens a round for the next bag player; markDone resolves it
 * and pre-selects the following turn (pending). resolveChoice fills the
 * prompt onto the open round. useSkip re-picks a new prompt for the SAME
 * player (no advance). refuse / handleTimeout apply a strike and advance.
 *
 * embeds: game.js stays discord-free. The panel layer (panel.js, Phase 5)
 * turns these result objects into embeds/components from store data, so the
 * API keeps an `embed` key reserved for that wiring (always null here).
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
const session = require('./session');
const prompts = require('./prompts');

// sessionId -> { userId, roundId, roundNo } | null (player currently acting)
const currentTurns = new Map();
// sessionId -> { player, roundNo } | null (pre-selected next turn)
const pendingTurns = new Map();

const RESULT_PENDING = 'pending';
const RESULT_DONE = 'done';
const RESULT_SKIP = 'skip';
const RESULT_REFUSE = 'refuse';
const RESULT_TIMEOUT = 'timeout';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function assertTurn(sessionId) {
  const turn = currentTurns.get(sessionId) || null;
  if (!turn) throw new Error(`tod: session ${sessionId} has no round in progress`);
  return turn;
}

function settingsOf(sessionId) {
  const s = store.getSession(sessionId);
  if (!s) return {};
  try {
    return JSON.parse(s.settings_json || '{}');
  } catch {
    return {};
  }
}

function enabledCategories(settings) {
  const raw = typeof settings.categories === 'string' ? settings.categories : '';
  return raw
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

function pickCategory(sessionId) {
  const settings = settingsOf(sessionId);
  const cats = enabledCategories(settings);
  if (cats.length === 0) return undefined;
  return cats[Math.floor(Math.random() * cats.length)];
}

function pickPrompt(sessionId, kind) {
  const settings = settingsOf(sessionId);
  const intensity = settings.intensity || 'pg13';
  const guildId = store.getSession(sessionId).guild_id;
  const spicyEnabledAt = store.getSpicyGate(guildId);
  const excludeIds = store.lastPromptKey(sessionId) ? [store.lastPromptKey(sessionId)] : [];

  // Single category pick keeps the pool inside the guild's enabled set;
  // spicy is only ever reachable when the guild gate unlocks it (R9).
  const options = {
    category: pickCategory(sessionId),
    intensity,
    kind,
    excludeIds,
    spicyEnabledAt,
  };
  return prompts.getRandomPrompt(options);
}

// ---------------------------------------------------------------------------
// Turn lifecycle
// ---------------------------------------------------------------------------

function presentChoice(sessionId, userId) {
  const s = store.getSession(sessionId);
  if (!s) throw new Error(`tod: session ${sessionId} does not exist`);
  if (s.status !== 'active') {
    throw new TypeError(`tod: presentChoice requires an active session (got '${s.status}')`);
  }

  // A round is already open: the same owner re-presenting is fine; a
  // different user is an R1 violation.
  const existing = currentTurns.get(sessionId) || null;
  if (existing) {
    if (existing.userId !== userId) {
      throw new TypeError('tod: not your turn - a round is already in progress');
    }
    return { roundId: existing.roundId, roundNo: existing.roundNo, embed: null };
  }

  // No open round: take the pre-selected pending turn or draw from the bag.
  const pending = pendingTurns.get(sessionId) || null;
  let owner = null;
  let roundNo = 0;
  if (pending) {
    owner = pending.player.user_id;
    roundNo = pending.roundNo;
    pendingTurns.delete(sessionId);
  } else {
    const rounds = store.listRounds(sessionId, 10000, 0);
    if (rounds.length === 0) {
      // Very first round: the caller opens the game and becomes current.
      owner = userId;
      roundNo = 1;
      session.notePick(sessionId, owner);
    } else {
      const next = session.nextTurn(sessionId);
      if (!next) return { roundId: null, roundNo: null, embed: null }; // no active players
      owner = next.player.user_id;
      roundNo = next.roundNo;
    }
  }

  if (owner !== userId) {
    throw new TypeError('tod: not your turn');
  }

  const created = store.recordRound({
    sessionId,
    roundNo,
    userId: owner,
    choice: null,
    result: RESULT_PENDING,
  });
  currentTurns.set(sessionId, { userId: owner, roundId: created.id, roundNo });
  log.info({ sessionId, roundId: created.id, userId: owner, roundNo }, 'tod round presented');
  return { roundId: created.id, roundNo, embed: null };
}

function resolveChoice(sessionId, choice) {
  if (choice !== 'truth' && choice !== 'dare') {
    throw new TypeError(`tod: choice must be 'truth' | 'dare' (got ${choice})`);
  }
  const turn = assertTurn(sessionId);

  const p = pickPrompt(sessionId, choice);
  if (!p) return { prompt: null, embed: null };

  store.setRoundPrompt(turn.roundId, {
    choice,
    promptText: p.text,
    promptId: p.id,
    category: p.category || null,
    intensity: p.intensity || null,
  });
  store.pushPromptHistory({
    sessionId,
    roundNo: turn.roundNo,
    promptKey: p.id,
  });

  log.info({ sessionId, roundId: turn.roundId, choice, promptId: p.id }, 'tod prompt served');
  return { prompt: p, embed: null };
}

function markDone(sessionId, userId) {
  const turn = assertTurn(sessionId);
  if (turn.userId !== userId) {
    throw new TypeError('tod: not your turn');
  }

  const round = store.listRounds(sessionId, 10000, 0).find((r) => r.id === turn.roundId);
  const choice = round && round.choice;

  store.bumpPlayerStat(sessionId, userKey(userId), 'turns', 1);
  if (choice === 'truth') store.bumpPlayerStat(sessionId, userKey(userId), 'truths', 1);
  if (choice === 'dare') store.bumpPlayerStat(sessionId, userKey(userId), 'dares', 1);
  store.resolveRound(turn.roundId, RESULT_DONE, Date.now());

  currentTurns.delete(sessionId);

  // Pre-select the next turn so presentChoice does not double-advance the bag.
  const next = session.nextTurn(sessionId);
  if (!next) {
    endSession(sessionId);
    return { ok: true, nextRound: null };
  }
  pendingTurns.set(sessionId, next);
  log.info({ sessionId, nextUser: next.player.user_id, nextRound: next.roundNo }, 'tod round done');
  return { ok: true, nextRound: next };
}

function useSkip(sessionId, userId) {
  const turn = assertTurn(sessionId);
  if (turn.userId !== userId) {
    throw new TypeError('tod: not your turn');
  }
  const settings = settingsOf(sessionId);
  const skipTokens = Number(settings.skip_tokens) || 3;

  const player = store.listPlayers(sessionId).find((pl) => pl.user_id === userId);
  if (player && player.skips_used >= skipTokens) {
    return { ok: false, reason: 'no_tokens' };
  }

  // Skip requires a served prompt (the thing being skipped).
  const round = store.listRounds(sessionId, 10000, 0).find((r) => r.id === turn.roundId);
  const choice = round && round.choice;
  if (!choice) {
    throw new TypeError('tod: cannot skip before a prompt is served');
  }

  store.bumpPlayerStat(sessionId, userKey(userId), 'skips_used', 1);

  const p = pickPrompt(sessionId, choice);
  if (!p) {
    return { ok: true, reason: 'skip', prompt: null, embed: null };
  }

  store.setRoundPrompt(turn.roundId, {
    choice,
    promptText: p.text,
    promptId: p.id,
    category: p.category || null,
    intensity: p.intensity || null,
  });
  store.pushPromptHistory({ sessionId, roundNo: turn.roundNo, promptKey: p.id });

  return { ok: true, reason: 'skip', prompt: p, embed: null };
}

// Peek at the pre-selected next turn without consuming it (panel layer uses
// this to drive the bot-posted "next player's turn" automatically).
function peekPending(sessionId) {
  return pendingTurns.get(sessionId) || null;
}

// Which user currently owns the open round (panel layer enforces the mockup
// "other players see 'not your turn'" on the public round/prompt buttons).
function currentUser(sessionId) {
  const turn = currentTurns.get(sessionId) || null;
  return turn ? turn.userId : null;
}

// Turn-menu "Skip": resolve the open round as 'skip' BEFORE any prompt is
// served (mockup -3). Strike-free, spends a skip token (R5), advances.
function skipTurn(sessionId, userId) {
  const turn = assertTurn(sessionId);
  if (turn.userId !== userId) {
    throw new TypeError('tod: not your turn');
  }
  const settings = settingsOf(sessionId);
  const skipTokens = Number(settings.skip_tokens) || 3;

  const player = store.listPlayers(sessionId).find((pl) => pl.user_id === userId);
  if (player && player.skips_used >= skipTokens) {
    return { ok: false, reason: 'no_tokens' };
  }

  store.bumpPlayerStat(sessionId, userKey(userId), 'skips_used', 1);
  store.resolveRound(turn.roundId, RESULT_SKIP, Date.now());
  currentTurns.delete(sessionId);

  const next = session.nextTurn(sessionId);
  if (!next) {
    endSession(sessionId);
    return { ok: true, reason: 'skip', nextRound: null, ended: true };
  }
  pendingTurns.set(sessionId, next);
  log.info({ sessionId, nextUser: next.player.user_id, nextRound: next.roundNo }, 'tod turn skipped');
  return { ok: true, reason: 'skip', nextRound: next, ended: false };
}

function strike(sessionId, result) {
  const turn = assertTurn(sessionId);
  const settings = settingsOf(sessionId);
  const strikesToKick = Number(settings.strikes_to_kick) || 3;

  store.addStrikes(sessionId, turn.userId, 1);
  const player = store.listPlayers(sessionId).find((pl) => pl.user_id === turn.userId);

  let spectated = false;
  const strikes = player ? player.strikes : 0;
  if (player && strikes >= strikesToKick) {
    store.setSpectator(sessionId, turn.userId);
    spectated = true;
  }

  store.resolveRound(turn.roundId, result, Date.now());
  currentTurns.delete(sessionId);

  // Advance to the next turn; if the strike emptied the roster, auto-end.
  const next = session.nextTurn(sessionId);
  if (!next) {
    endSession(sessionId);
    return { strikes, spectated, ended: true, nextRound: null };
  }
  pendingTurns.set(sessionId, next);
  return { strikes, spectated, ended: false, nextRound: next };
}

function refuse(sessionId, userId) {
  const turn = assertTurn(sessionId);
  if (turn.userId !== userId) {
    throw new TypeError('tod: not your turn');
  }
  return strike(sessionId, RESULT_REFUSE);
}

function handleTimeout(sessionId) {
  return strike(sessionId, RESULT_TIMEOUT);
}

function cancelRound(sessionId) {
  const turn = currentTurns.get(sessionId) || null;
  if (turn) {
    try {
      store.resolveRound(turn.roundId, RESULT_TIMEOUT, Date.now());
    } catch {
      /* best-effort cleanup */
    }
  }
  currentTurns.delete(sessionId);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function endSession(sessionId) {
  const players = store.listPlayers(sessionId);
  const summary = {
    reason: 'all_spectators',
    ended_at: Date.now(),
    players: players.map((p) => ({
      user_id: p.user_id,
      turns: p.turns,
      truths: p.truths,
      dares: p.dares,
      skips_used: p.skips_used,
      strikes: p.strikes,
    })),
  };
  session.endSession(sessionId, summary);
  currentTurns.delete(sessionId);
  pendingTurns.delete(sessionId);
  log.info({ sessionId }, 'tod session auto-ended (no active players)');
}

function userKey(userId) {
  return userId;
}

module.exports = {
  presentChoice,
  resolveChoice,
  markDone,
  useSkip,
  skipTurn,
  refuse,
  handleTimeout,
  cancelRound,
  peekPending,
  currentUser,
};