/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - round + answer timer tests (Deliverable 4)
 *
 * All ToD timers must flow through the shared scheduler (register /
 * stopScheduler) - never raw setInterval / setTimeout. The scheduler tick is
 * skipped when no client is bound, so tests bind a fake client up front and
 * drive time with vi.useFakeTimers.
 */

process.env.TOD_DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

process.env.TOD_DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

const require = createRequire(import.meta.url);
const store = require('../../src/utils/tod/store.js');
const session = require('../../src/utils/tod/session.js');
const timers = require('../../src/utils/tod/timers.js');
const scheduler = require('../../src/security/scheduler.js');

const G = '111111111111111111';
const CH = '222222222222222222';
const HOST = '333333333333333333';
const CONFIG = { turn_timer_s: 1, truth_timer_s: 2, dare_timer_s: 3 };

let sid;

beforeEach(() => {
  scheduler.bindClient({ fake: true });
  scheduler.stopAllSchedulers();
  vi.useFakeTimers();
  const s = session.openLobby({ guildId: G, channelId: CH, hostId: HOST, config: CONFIG });
  sid = s.id;
});

afterEach(() => {
  scheduler.stopAllSchedulers();
  scheduler.unbindClient();
  vi.useRealTimers();
});

describe('startTurnTimer', () => {
  it('fires onTimeout after the configured turn_timer_s', () => {
    const spy = vi.fn();
    timers.startTurnTimer(sid, spy);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not fire twice after a re-arm in the same session', () => {
    const spy = vi.fn();
    timers.startTurnTimer(sid, spy);
    vi.advanceTimersByTime(500);
    timers.startTurnTimer(sid, spy);
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is armed through scheduler.register, never a raw interval', () => {
    const register = vi.spyOn(scheduler, 'register');
    timers.startTurnTimer(sid, vi.fn());
    expect(register).toHaveBeenCalledTimes(1);
    const [label, everyMs] = register.mock.calls[0];
    expect(label).toMatch(/^tod:turn:/);
    expect(everyMs).toBe(1000);
    register.mockRestore();
  });
});

describe('startAnswerTimer', () => {
  it('uses dare_timer_s when the last round choice is dare', () => {
    store.recordRound({ sessionId: sid, roundNo: 1, userId: HOST, choice: 'dare', result: 'pending' });
    const spy = vi.fn();
    timers.startAnswerTimer(sid, spy);
    vi.advanceTimersByTime(3000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('uses truth_timer_s when the last round choice is truth', () => {
    store.recordRound({ sessionId: sid, roundNo: 1, userId: HOST, choice: 'truth', result: 'pending' });
    const spy = vi.fn();
    timers.startAnswerTimer(sid, spy);
    vi.advanceTimersByTime(2000);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('cancelTimers', () => {
  it('prevents a pending turn timer from firing', () => {
    const spy = vi.fn();
    timers.startTurnTimer(sid, spy);
    timers.cancelTimers(sid);
    vi.advanceTimersByTime(5000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('endSession cancels every armed timer for the session', () => {
    const spy = vi.fn();
    timers.startTurnTimer(sid, spy);
    session.endSession(sid, { reason: 'host_end' });
    vi.advanceTimersByTime(5000);
    expect(spy).not.toHaveBeenCalled();
  });
});