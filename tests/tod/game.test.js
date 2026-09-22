/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - game turn orchestration tests (Deliverable 4)
 *
 * Runs against an in-memory SQLite database (see session.test.js for the
 * TOD_DB_PATH-before-require pattern).
 */

process.env.TOD_DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

process.env.TOD_DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

const require = createRequire(import.meta.url);
const store = require('../../src/utils/tod/store.js');
const session = require('../../src/utils/tod/session.js');
const game = require('../../src/utils/tod/game.js');

const G = '111111111111111111';
const CH = '222222222222222222';
const HOST = '333333333333333333';
const P2 = '444444444444444444';
const P3 = '555555555555555555';
const BASE_CONFIG = {
  intensity: 'pg13',
  categories: 'Funny,Deep,Weird',
  turn_timer_s: 1,
  truth_timer_s: 2,
  dare_timer_s: 3,
  skip_tokens: 2,
  strikes_to_kick: 2,
};

beforeAll(() => {
  store.getOrCreateGuildConfig(G);
});

function makeSession(config = BASE_CONFIG) {
  return session.openLobby({ guildId: G, channelId: CH, hostId: HOST, config });
}

function openWith(extraUserIds, config = BASE_CONFIG) {
  const s = makeSession(config);
  for (const id of extraUserIds) session.join(s.id, id);
  session.start(s.id);
  return s;
}

describe('presentChoice', () => {
  it('creates a round with choice NULL and result pending', () => {
    const s = openWith([P2]);
    const res = game.presentChoice(s.id, HOST);
    expect(res.roundId).toBeTypeOf('number');
    expect(res.embed).toBeNull();
    const rounds = store.listRounds(s.id);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].choice).toBeNull();
    expect(rounds[0].result).toBe('pending');
    expect(rounds[0].user_id).toBe(HOST);
  });

  it('R1: a non-current player cannot present while a round is open', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    expect(() => game.presentChoice(s.id, P2)).toThrow(TypeError);
  });

  it('rejects present on a non-active session', () => {
    const s = makeSession();
    expect(() => game.presentChoice(s.id, HOST)).toThrow(TypeError);
  });
});

describe('resolveChoice', () => {
  it('rejects an invalid choice', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    expect(() => game.resolveChoice(s.id, 'food')).toThrow(TypeError);
  });

  it('serves a prompt and writes it onto the open round', () => {
    const s = openWith([P2]);
    const res = game.presentChoice(s.id, HOST);
    const served = game.resolveChoice(s.id, 'truth');
    expect(served.prompt).not.toBeNull();
    expect(served.prompt.text).toBeTypeOf('string');
    const round = store.listRounds(s.id, 10000, 0).find((r) => r.id === res.roundId);
    expect(round.choice).toBe('truth');
    expect(round.prompt_text).not.toBeNull();
    expect(round.prompt_id).toBe(store.lastPromptKey(s.id));
  });

  it('R8: the next round never re-serves the previous prompt key', () => {
    const s = openWith([P2]);
    const r1 = game.presentChoice(s.id, HOST);
    const first = game.resolveChoice(s.id, 'truth');
    game.markDone(s.id, HOST);
    game.presentChoice(s.id, P2);
    const second = game.resolveChoice(s.id, 'truth');
    expect(second.prompt.id).not.toBe(first.prompt.id);
    expect(store.listRounds(s.id)).toHaveLength(2);
    expect(r1.roundId).toBeTypeOf('number');
  });
});

describe('markDone', () => {
  it('R1: a non-current player cannot mark the round done', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    expect(() => game.markDone(s.id, P2)).toThrow(TypeError);
  });

  it('increments the current player turn + choice stats', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    game.resolveChoice(s.id, 'dare');
    const done = game.markDone(s.id, HOST);
    expect(done.ok).toBe(true);
    const host = store.listPlayers(s.id).find((p) => p.user_id === HOST);
    expect(host.turns).toBe(1);
    expect(host.dares).toBe(1);
    expect(host.truths).toBe(0);
  });

  it('throws when marking done twice in a row', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    game.resolveChoice(s.id, 'truth');
    game.markDone(s.id, HOST);
    expect(() => game.markDone(s.id, HOST)).toThrow();
  });

  it('advances to the next round with round_no + 1', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    game.resolveChoice(s.id, 'truth');
    const after = game.markDone(s.id, HOST);
    expect(after.nextRound.player.user_id).toBe(P2);
    expect(after.nextRound.roundNo).toBe(2);
    const res = game.presentChoice(s.id, P2);
    expect(res.roundId).toBeTypeOf('number');
    const rounds = store.listRounds(s.id);
    expect(rounds[1].round_no).toBe(2);
    expect(rounds[1].user_id).toBe(P2);
  });
});

describe('useSkip', () => {
  it('throws when trying to skip before a prompt is served', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    expect(() => game.useSkip(s.id, HOST)).toThrow(TypeError);
  });

  it('consumes a token, keeps the turn, and re-picks a prompt', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    game.resolveChoice(s.id, 'truth');
    const res = game.useSkip(s.id, HOST);
    expect(res.ok).toBe(true);
    expect(res.reason).toBe('skip');
    expect(res.prompt).not.toBeNull();
    const host = store.listPlayers(s.id).find((p) => p.user_id === HOST);
    expect(host.skips_used).toBe(1);
    expect(store.countActivePlayers(s.id)).toBe(2);
  });

  it('refuses once the token budget is exhausted', () => {
    const cfg = { ...BASE_CONFIG, skip_tokens: 1 };
    const s = openWith([P2], cfg);
    game.presentChoice(s.id, HOST);
    game.resolveChoice(s.id, 'truth');
    expect(game.useSkip(s.id, HOST).ok).toBe(true);
    const again = game.useSkip(s.id, HOST);
    expect(again).toEqual({ ok: false, reason: 'no_tokens' });
  });
});

describe('refuse / handleTimeout / strikes', () => {
  it('refuse applies a strike and advances the turn', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    game.resolveChoice(s.id, 'truth');
    const res = game.refuse(s.id, HOST);
    expect(res.strikes).toBe(1);
    expect(res.spectated).toBe(false);
    const host = store.listPlayers(s.id).find((p) => p.user_id === HOST);
    expect(host.strikes).toBe(1);
    expect(game.presentChoice(s.id, P2).roundId).toBeTypeOf('number');
  });

  it('R1: only the current player can refuse', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    expect(() => game.refuse(s.id, P2)).toThrow(TypeError);
  });

  it('handleTimeout applies a timeout strike for the current player', () => {
    const s = openWith([P2]);
    game.presentChoice(s.id, HOST);
    game.resolveChoice(s.id, 'dare');
    const res = game.handleTimeout(s.id);
    expect(res.strikes).toBe(1);
    const hist = [];
    for (const r of store.listRounds(s.id)) hist.push(r.result);
    expect(hist).toContain('timeout');
  });

  it('strikes reaching strikes_to_kick spectates and auto-ends the empty roster', () => {
    const cfg = { ...BASE_CONFIG, strikes_to_kick: 1 };
    const s = openWith([P2], cfg);
    game.presentChoice(s.id, HOST);
    game.resolveChoice(s.id, 'truth');
    const first = game.refuse(s.id, HOST);
    expect(first.spectated).toBe(true);
    expect(store.listPlayers(s.id).find((p) => p.user_id === HOST).status).toBe('spectator');
    game.presentChoice(s.id, P2);
    game.resolveChoice(s.id, 'truth');
    const second = game.refuse(s.id, P2);
    expect(second.ended).toBe(true);
    expect(store.getSession(s.id).status).toBe('ended');
    expect(JSON.parse(store.getSession(s.id).summary_json).reason).toBe('all_spectators');
  });
});

describe('fair-bag rotation', () => {
  it('every active player gets at least one turn over 50 draws, never twice in a row', () => {
    const s = openWith([P2, P3]);
    const picks = [];
    for (let i = 0; i < 50; i += 1) picks.push(session.nextTurn(s.id).player.user_id);
    expect(new Set(picks).size).toBe(3);
    for (let i = 1; i < picks.length; i += 1) {
      expect(picks[i]).not.toBe(picks[i - 1]);
    }
  });
});