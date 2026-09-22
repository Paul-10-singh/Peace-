/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - session lifecycle tests (Deliverable 4)
 *
 * Runs against an in-memory SQLite database. All ToD modules are loaded
 * through Node's real CJS require (createRequire) so session.js's internal
 * require('./store') resolves to the same single module instance - and the
 * same :memory: db handle. TOD_DB_PATH must be set BEFORE store is required.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

process.env.TOD_DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

const require = createRequire(import.meta.url);
const store = require('../../src/utils/tod/store.js');
const session = require('../../src/utils/tod/session.js');

const G = '111111111111111111';
const CH = '222222222222222222';
const HOST = '333333333333333333';
const P2 = '444444444444444444';
const P3 = '555555555555555555';
const DEFAULT_CONFIG = { turn_timer_s: 1, truth_timer_s: 2, dare_timer_s: 3 };

function makeSession() {
  return session.openLobby({ guildId: G, channelId: CH, hostId: HOST, config: DEFAULT_CONFIG });
}

beforeAll(() => {
  store.getOrCreateGuildConfig(G);
});

describe('openLobby', () => {
  it('creates a row with status lobby and auto-joins the host', () => {
    const s = makeSession();
    expect(s.status).toBe('lobby');
    expect(s.host_id).toBe(HOST);
    expect(store.countActivePlayers(s.id)).toBe(1);
    expect(JSON.parse(s.settings_json).turn_timer_s).toBe(1);
  });
});

describe('join / leave', () => {
  it('join adds an active player; duplicate join returns rejoin', () => {
    const s = makeSession();
    expect(session.join(s.id, P2)).toEqual({ joined: true, rejoin: false });
    expect(store.countActivePlayers(s.id)).toBe(2);
    expect(session.join(s.id, P2)).toEqual({ joined: false, rejoin: true });
    expect(store.countActivePlayers(s.id)).toBe(2);
  });

  it('leave sets status to left', () => {
    const s = makeSession();
    session.join(s.id, P2);
    expect(session.leave(s.id, P2)).toBe(true);
    const player = store.listPlayers(s.id).find((p) => p.user_id === P2);
    expect(player.status).toBe('left');
  });

  it('late join is allowed while the session is active', () => {
    const s = makeSession();
    session.join(s.id, P2);
    session.start(s.id);
    expect(session.join(s.id, P3).joined).toBe(true);
  });
});

describe('start', () => {
  it('transitions lobby to active', () => {
    const s = makeSession();
    const active = session.start(s.id);
    expect(active.status).toBe('active');
  });

  it('start on an active session throws TypeError', () => {
    const s = makeSession();
    session.start(s.id);
    expect(() => session.start(s.id)).toThrow(TypeError);
  });
});

describe('nextTurn', () => {
  it('throws TypeError while the session is still in lobby', () => {
    const s = makeSession();
    expect(() => session.nextTurn(s.id)).toThrow(TypeError);
  });

  it('round numbers increment by 1 across recorded rounds', () => {
    const s = makeSession();
    session.join(s.id, P2);
    session.start(s.id);
    // nextTurn reports the next round number after the last recorded round,
    // mirroring how game.js drives it: present (record) -> markDone -> present.
    expect(session.nextTurn(s.id).roundNo).toBe(1);
    store.recordRound({ sessionId: s.id, roundNo: 1, userId: HOST, result: 'pending' });
    expect(session.nextTurn(s.id).roundNo).toBe(2);
    store.recordRound({ sessionId: s.id, roundNo: 2, userId: P2, result: 'pending' });
    expect(session.nextTurn(s.id).roundNo).toBe(3);
  });

  it('rotates through every active player before repeating', () => {
    const s = makeSession();
    session.join(s.id, P2);
    session.join(s.id, P3);
    session.start(s.id);
    const ids = [session.nextTurn(s.id), session.nextTurn(s.id), session.nextTurn(s.id)]
      .map((n) => n.player.user_id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toHaveLength(3);
  });
});

describe('endSession', () => {
  it('ends the session, sets every player to left, and is idempotent', () => {
    const s = makeSession();
    session.join(s.id, P2);
    session.start(s.id);
    session.endSession(s.id, { reason: 'host_end' });
    expect(store.getSession(s.id).status).toBe('ended');
    for (const p of store.listPlayers(s.id)) expect(p.status).toBe('left');
    expect(() => session.endSession(s.id, { reason: 'again' })).not.toThrow();
    expect(store.getSession(s.id).status).toBe('ended');
  });
});

describe('zombie sweep', () => {
  it('ends sessions older than 6h with the bot_restart reason', () => {
    const s = makeSession();
    session.join(s.id, P2);
    session.start(s.id);
    const aged = Date.now() - (7 * 60 * 60 * 1000);
    store.getDb().prepare('UPDATE tod_sessions SET started_at = ? WHERE id = ?').run(aged, s.id);
    expect(session.sweepZombies([G])).toBe(1);
    const ended = store.getSession(s.id);
    expect(ended.status).toBe('ended');
    expect(JSON.parse(ended.summary_json)).toEqual({ reason: 'bot_restart' });
  });

  it('returns 0 when no zombie sessions exist', () => {
    const s = makeSession();
    expect(session.sweepZombies([G])).toBe(0);
    expect(store.getSession(s.id).status).toBe('lobby');
  });
});