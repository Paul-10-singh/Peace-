/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Scheduler hardening tests: re-entrancy, null-client guards, error
 * swallowing, unref(), stop/disable semantics, and the bootstrap shutdown
 * wiring. Plus a regression for the production crash (bootstrap.js alert-rules
 * tick reading undefined `.values`).
 *
 * NOTE: lives in test/security/ (not src/security/__tests__/) to match the
 * existing suite layout and the vitest include pattern.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';

const require = createRequire(import.meta.url);
const root = path.resolve(process.cwd());

// isolate persisted state for the bootstrap test (this worker only)
process.env.SECURITY_DB_PATH = path.join(os.tmpdir(), `peacex-scheduler-test-${process.pid}.db`);
process.env.SECURITY_METRICS_PORT = '0';

const scheduler = require(path.join(root, 'src/security/scheduler.js'));
const { logger } = require(path.join(root, 'src/security/log.js'));

const spy = {
  warn: () => vi.spyOn(logger, 'warn').mockImplementation(() => {}),
  error: () => vi.spyOn(logger, 'error').mockImplementation(() => {}),
  info: () => vi.spyOn(logger, 'info').mockImplementation(() => {}),
  debug: () => vi.spyOn(logger, 'debug').mockImplementation(() => {}),
};

function fakeClient() {
  const c = new EventEmitter();
  c.user = { id: '888' };
  c.channels = { cache: { get: () => null, find: () => null } };
  c.guilds = { cache: new Map(), fetch: async () => null };
  c.security = null;
  return c;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  scheduler.unbindClient();
  scheduler.enable();
  scheduler.stopAllSchedulers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('scheduler.register', () => {
  it('fires the fn on each interval while a client is bound', async () => {
    scheduler.bindClient(fakeClient());
    const calls = [];
    scheduler.register('t', 1000, () => calls.push(Date.now()));
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls).toHaveLength(3);
  });

  it('skips ticks when no client is bound — no call, no throw', async () => {
    const warn = spy.warn();
    let calls = 0;
    scheduler.register('t', 1000, () => { calls += 1; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ label: 't' }), 'scheduler:tick skipped — no active client');
  });

  it('catches a throwing fn, logs it, and continues firing later ticks', async () => {
    const error = spy.error();
    let calls = 0;
    scheduler.bindClient(fakeClient());
    scheduler.register('t', 1000, () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Cannot read properties of undefined (reading 'values')");
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(2);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ label: 't', err: "Cannot read properties of undefined (reading 'values')" }),
      'scheduler:tick failed'
    );
  });

  it('is re-entrancy safe: a slow tick causes the next fire to be skipped', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    let calls = 0;
    scheduler.bindClient(fakeClient());
    scheduler.register('t', 1000, async () => { calls += 1; await gate; });

    const warn = spy.warn();
    await vi.advanceTimersByTimeAsync(2000); // tick 1 in flight at +1000; tick 2 at +2000 skipped
    expect(calls).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ label: 't' }), 'scheduler:tick skipped — still running');

    release();
    await vi.advanceTimersByTimeAsync(0); // flush microtasks → inFlight cleared
    await vi.advanceTimersByTimeAsync(1000); // next tick (+3000) fires
    expect(calls).toBe(2);
  });

  it('logs a slow tick when it exceeds 5s', async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const warn = spy.warn();
    scheduler.bindClient(fakeClient());
    scheduler.register('t', 1000, async () => {
      await sleep(6000);
    });
    await vi.advanceTimersByTimeAsync(7000); // tick fires at +1000, its sleep ends at +7000
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ label: 't', durationMs: expect.any(Number) }), 'scheduler:tick slow');
  });

  it('calls handle.unref() on the interval handle', () => {
    vi.useRealTimers();
    const unref = vi.fn();
    const clear = vi.fn();
    const returned = { unref, ref: vi.fn(), hasRef: vi.fn(), refresh: vi.fn(), [Symbol.toPrimitive]: () => 1 };
    const setSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(returned);
    const clearSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(clear);

    scheduler.register('t', 1000, () => {});
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);

    expect(scheduler.stopScheduler('t')).toBe(true);
    expect(clear).toHaveBeenCalledWith(returned);

    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it('returns false when stopping an unknown label', () => {
    expect(scheduler.stopScheduler('missing')).toBe(false);
  });
});

describe('scheduler stop + disable semantics', () => {
  it('stopScheduler clears a single label; stopAllSchedulers clears the rest', async () => {
    scheduler.bindClient(fakeClient());
    let a = 0;
    let b = 0;
    scheduler.register('a', 1000, () => { a += 1; });
    scheduler.register('b', 1000, () => { b += 1; });

    expect(scheduler.stopScheduler('a')).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(a).toBe(0);
    expect(b).toBe(2);

    scheduler.stopAllSchedulers();
    await vi.advanceTimersByTimeAsync(2000);
    expect(b).toBe(2); // frozen
  });

  it('disable() pauses ticks and enable() resumes them', async () => {
    scheduler.bindClient(fakeClient());
    let calls = 0;
    const warn = spy.warn();
    scheduler.register('t', 1000, () => { calls += 1; });

    scheduler.disable();
    expect(scheduler.isPaused()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ label: 't' }), 'scheduler:tick skipped — disarmed');

    scheduler.enable();
    expect(scheduler.isPaused()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(2);
  });
});

describe('grant-sweep crash regression', () => {
  it('a throwing tick is logged once and NEVER triggers unhandledRejection', async () => {
    const error = spy.error();
    let unhandled = 0;
    const onRejection = () => { unhandled += 1; };
    process.on('unhandledRejection', onRejection);

    scheduler.bindClient(fakeClient());
    scheduler.register('grant-sweep', 600_000, () => {
      const lat = undefined; // the production shape: X.values where X is undefined
      void lat.values;
    });

    await vi.advanceTimersByTimeAsync(600_000);
    await vi.advanceTimersByTimeAsync(0); // let any leaked rejection surface here
    expect(unhandled).toBe(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ label: 'grant-sweep' }), 'scheduler:tick failed');

    process.removeListener('unhandledRejection', onRejection);
  });
});

describe('bootstrap shutdown wiring', () => {
  it('bootstrap.shutdown() unbinds the client and stops every scheduler', async () => {
    const bootstrapPath = path.join(root, 'src/security/bootstrap.js');
    delete require.cache[bootstrapPath];
    const { bootstrap, shutdown } = require(bootstrapPath);

    const unbindSpy = vi.spyOn(scheduler, 'unbindClient');
    const stopSpy = vi.spyOn(scheduler, 'stopAllSchedulers');

    const client = fakeClient();
    client.security = bootstrap(client);
    expect(client.security.scheduler).toBeDefined();

    // prove the previously-crashing alert-rules tick (60s) now executes cleanly
    const metrics = require(path.join(root, 'src/security/observability/metrics.js'));
    const alertSpy = vi.spyOn(metrics, 'checkAlerts');
    await vi.advanceTimersByTimeAsync(61_000);
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();

    let fired = 0;
    scheduler.register('bootstrap-smoke', 1000, () => { fired += 1; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fired).toBe(1);

    shutdown();
    expect(unbindSpy).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    expect(fired).toBe(1); // nothing left armed to fire

    unbindSpy.mockRestore();
    stopSpy.mockRestore();
  });
});