/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare module - timers.js (Deliverable 4)
 *
 * Round turn + answer timers. ALL timers flow through the shared security
 * scheduler (src/security/scheduler.js register / stopScheduler). No raw
 * setInterval / setTimeout here.
 *
 * Labels are one per session per kind:
 *   tod:turn:<sessionId>   - turn (choice) timeout
 *   tod:answer:<sessionId> - truth/dare answer timeout
 *
 * A label is deterministic per session, so scheduler.register REPLACES any
 * existing job with the same label (double-start cannot orphan a timer).
 *
 * Durations come from the session's settings_json snapshot:
 *   turn_timer_s      -> turn timer (seconds)
 *   truth_timer_s     -> answer timer when the open round choice is truth
 *   dare_timer_s      -> answer timer when the open round choice is dare
 */

'use strict';

const pino = require('pino');
const log = pino({
  name: 'peace-tod',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'peace-tod', developedBy: 'Smith.Code' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const scheduler = require('../../security/scheduler');
const store = require('./store');

const DEFAULT_MS = 30 * 1000;
const DEFAULT_TRUTH_MS = 120 * 1000;
const DEFAULT_DARE_MS = 300 * 1000;

const PREFIX_TURN = 'tod:turn:';
const PREFIX_ANSWER = 'tod:answer:';

function turnLabel(sessionId) {
  return `${PREFIX_TURN}${sessionId}`;
}
function answerLabel(sessionId) {
  return `${PREFIX_ANSWER}${sessionId}`;
}

function sessionSettings(sessionId) {
  const session = store.getSession(sessionId);
  if (!session) return {};
  try {
    return JSON.parse(session.settings_json || '{}');
  } catch {
    return {};
  }
}

function msFor(kind, sessionId) {
  const settings = sessionSettings(sessionId);
  if (kind === 'answer') {
    const rounds = store.listRounds(sessionId, 10, 0);
    const last = rounds[rounds.length - 1];
    const s = last && last.choice === 'dare' ? settings.dare_timer_s : settings.truth_timer_s;
    const base = last && last.choice === 'dare' ? DEFAULT_DARE_MS : DEFAULT_TRUTH_MS;
    const num = Number(s);
    return Number.isFinite(num) && num > 0 ? num * 1000 : base;
  }
  const num = Number(settings.turn_timer_s);
  return Number.isFinite(num) && num > 0 ? num * 1000 : DEFAULT_MS;
}

// One-shot wrapper: cancel the job when it fires, then run onTimeout. The
// scheduler tick guards itself (paused / in-flight / no client) so even a
// late fire can never crash anything.
function startOneShot(label, ms, onTimeout) {
  scheduler.register(label, ms, () => {
    scheduler.stopScheduler(label);
    if (typeof onTimeout === 'function') onTimeout();
  });
  log.info({ label, ms }, 'tod timer armed');
  return label;
}

function startTurnTimer(sessionId, onTimeout) {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new TypeError(`tod: session_id must be a positive integer (got ${sessionId})`);
  }
  return startOneShot(turnLabel(sessionId), msFor('turn', sessionId), onTimeout);
}

function startAnswerTimer(sessionId, onTimeout) {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new TypeError(`tod: session_id must be a positive integer (got ${sessionId})`);
  }
  return startOneShot(answerLabel(sessionId), msFor('answer', sessionId), onTimeout);
}

function cancelTurnTimer(sessionId) {
  scheduler.stopScheduler(turnLabel(sessionId));
}

function cancelAnswerTimer(sessionId) {
  scheduler.stopScheduler(answerLabel(sessionId));
}

function cancelTimers(sessionId) {
  cancelTurnTimer(sessionId);
  cancelAnswerTimer(sessionId);
  log.info({ sessionId }, 'tod timers cancelled');
}

module.exports = {
  startTurnTimer,
  startAnswerTimer,
  cancelTimers,
  cancelTurnTimer,
  cancelAnswerTimer,
};