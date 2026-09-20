import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { createRequire } from 'module';

// Native CommonJS require keeps ONE module instance shared with everything the
// SUT pulls in via its own require() — dynamic/static ESM import can create a
// second copy whose module-level DB/settings/cache diverge.
const require = createRequire(import.meta.url);

const { openDatabase } = require('../../src/security/db.js');
const baseline = require('../../src/security/behavior/baseline.js');
const anomalies = require('../../src/security/behavior/anomalies.js');
const { set } = require('../../src/utils/settings.js');

let db;

const BASE = 1_700_000_000_000;

beforeEach(() => {
  db = openDatabase(':memory:');
  baseline.init(db);
  process.env.SECURITY_ANOMALY = '1';
});

afterEach(() => {
  delete process.env.SECURITY_ANOMALY;
  vi.useRealTimers();
});

function clientStub() {
  return {
    user: { id: 'BOT' },
    channels: { cache: { get: () => null, find: () => null } },
    guilds: { cache: new Map(), fetch: async () => null },
  };
}

/** 60s aligned start of the current "hour" in fake time. */
function currentHourStart(now) {
  return now - (now % 3_600_000);
}

describe('baseline.recordEvent + hourlySamples', () => {
  it('inserts events and buckets them hourly', () => {
    baseline.recordEvent('U', 'G', 'message', 'C', { len: 5 }, BASE);
    baseline.recordEvent('U', 'G', 'message', 'C', { len: 9 }, BASE + 3600_000);
    const samples = baseline.hourlySamples('U', 'G', { now: BASE + 7200_000 });
    expect(samples.length).toBe(2);
    expect(samples[0].actionsPerHour).toBe(1);
    expect(baseline.eventsIn('U', 'G', BASE, BASE + 3599_999)).toHaveLength(1);
    expect(baseline.recordEvent('U', 'G', 'message', 'C')).toBeDefined();
  });

  it('folds each closing hourly bucket into the Welford baseline once', () => {
    baseline.recordEvent('U', 'G', 'message', 'C1', {}, BASE + 1000);
    baseline.recordEvent('U', 'G', 'message', 'C2', {}, BASE + 2000);
    baseline.recordEvent('U', 'G', 'message', 'C1', {}, BASE + 3600_000 + 1000);

    // hour 0 (2 events) folded on insert; hour 1 is still open
    expect(baseline.baselineOf('U', 'G', 'actions.hourly.count').count).toBe(1);

    // once hour 1 closes, the next fold picks it up exactly once
    const folded = baseline.foldHourlyBuckets('U', 'G', { now: BASE + 7200_000 });
    expect(folded).toBe(1);
    expect(baseline.baselineOf('U', 'G', 'actions.hourly.count').count).toBe(2);

    expect(baseline.foldHourlyBuckets('U', 'G', { now: BASE + 7200_000 + 1 })).toBe(0); // idempotent
  });

  it('exposes stats and clear wipes traces', () => {
    baseline.recordEvent('U', 'G', 'message', 'C', {}, BASE);
    baseline.recordEvent('U', 'G', 'message', 'C', {}, BASE + 3600_000);
    const stats = baseline.stats('U', 'G', { now: BASE + 7200_000 });
    expect(stats.events).toBe(2);
    expect(stats.anomalies).toEqual([]);
    expect(typeof stats.zscores['actions.hourly.count']).toBe('number');
    expect(stats.baselines.length).toBeGreaterThan(0);
    baseline.clear('U', 'G');
    expect(baseline.stats('U', 'G', { now: BASE + 7200_000 }).events).toBe(0);
  });

  it('returns an empty sample set for a user with no events', () => {
    expect(baseline.hourlySamples('NOBODY', 'G', { now: BASE })).toEqual([]);
    expect(baseline.anomalies('NOBODY', 'G', { now: BASE }).anomalies).toEqual([]);
    const sample = baseline.currentSample('NOBODY', 'G', { now: BASE });
    expect(sample['actions.hourly.count']).toBe(0);
  });
});

describe('baseline.anomalies (z-score)', () => {
  it('flags a burst when the baseline has >= MIN_SAMPLES and z > 3.5', () => {
    // 50 hourly buckets alternating count 1/2 → mean ≈ 1.5, std > 0
    for (let i = 0; i < 50; i += 1) {
      const off = i * 3600_000 + ((i % 2) ? 1000 : 1);
      baseline.recordEvent('U', 'G', 'message', 'C', {}, BASE + off);
      if (i % 2 === 0) baseline.recordEvent('U', 'G', 'message', 'D', {}, BASE + off + 1);
    }
    // current-hour burst: 10 rapid events
    const burstStart = BASE + 50 * 3600_000;
    for (let k = 0; k < 10; k += 1) baseline.recordEvent('U', 'G', 'message', 'Z', {}, burstStart + k * 1000);

    const res = baseline.anomalies('U', 'G', { now: BASE + 51 * 3600_000 });
    const hourly = res.anomalies.find((a) => a.metric === 'actions.hourly.count');
    expect(hourly).toBeDefined();
    expect(hourly.anomalous).toBe(true);
    expect(hourly.z).toBeGreaterThan(3.5);
    expect(hourly.samples).toBeGreaterThanOrEqual(baseline.MIN_SAMPLES);
  });

  it('does not flag below the minimum sample count', () => {
    baseline.recordEvent('U', 'G', 'message', 'C', {}, BASE);
    const res = baseline.anomalies('U', 'G', { now: BASE + 3600_000 });
    expect(res.anomalies).toHaveLength(0);
  });

  it('never flags a drop below the baseline', () => {
    for (let i = 0; i < 60; i += 1) baseline.recordEvent('U', 'G', 'message', 'C', {}, BASE + i * 3600_000);
    const res = baseline.anomalies('U', 'G', { now: BASE + 60 * 3600_000 }); // no events in current hour
    expect(res.anomalies).toHaveLength(0);
  });

  it('returns zscores even for a zero-sample user', () => {
    const res = baseline.anomalies('NOBODY', 'G', { now: BASE });
    expect(res.zscores).toBeTypeOf('object');
  });
});

describe('anomalies.evaluate (soft-lock)', () => {
  it('returns [] when security is disabled for the guild', async () => {
    const member = { guild: { id: 'G', ownerId: 'OWNER' }, id: 'U', moderatable: true, timeout: async () => {} };
    const flagged = await anomalies.evaluate(clientStub(), member);
    expect(flagged).toEqual([]);
  });

  it('soft-locks a member with a sustained anomaly and clears on verify', async () => {
    const hourStart = currentHourStart(BASE + 51 * 3600_000);
    const now = hourStart + 5000; // 5s into the current hour
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // enable security so the evaluate gate opens
    set('G', 'security', { enabled: true, behavior: {}, antiNuke: {}, words: [], whitelist: [] });

    // build a 50-sample baseline across past hours (hourly counts alternate 1/2)
    for (let i = 1; i <= 50; i += 1) {
      const at = hourStart - i * 3600_000 + ((i % 2) ? 1000 : 1);
      baseline.recordEvent('U', 'G', 'message', 'C', {}, at);
      if (i % 2 === 0) baseline.recordEvent('U', 'G', 'message', 'D', {}, at + 1);
    }
    // burst in the current hour (all timestamps < now)
    for (let k = 0; k < 12; k += 1) baseline.recordEvent('U', 'G', 'message', 'Z', {}, hourStart + 1000 + k * 100);

    const timedOut = [];
    const member = {
      guild: { id: 'G', ownerId: 'OWNER' },
      id: 'U',
      moderatable: true,
      timeout: async (ms, reason) => timedOut.push([ms, reason]),
    };

    const flagged = await anomalies.evaluate(clientStub(), member);
    expect(flagged.length).toBeGreaterThan(0);
    expect(timedOut.length).toBe(1);
    expect(anomalies.isLocked('G', 'U')).toBe(true);

    // verify clears the pending lock
    expect(anomalies.verify('G:U')).toBe(true);
    expect(anomalies.isLocked('G', 'U')).toBe(false);
    expect(anomalies.verify('G:U')).toBe(false); // already cleared
  });

  it('lists pending locks and can be disabled', async () => {
    expect(anomalies.listLocks()).toEqual([]);
    anomalies.disable();
  });
});