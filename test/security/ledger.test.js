import os from 'os';
import path from 'path';
import fs from 'fs';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';

import { openDatabase } from '../../src/security/db.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'peacex-ledger-'));
let chain;
let merkle;
let sink;

beforeAll(async () => {
  process.env.SECURITY_ED25519_KEY = path.join(TMP, 'sigkey.ed25519');
  process.env.SECURITY_MIRROR_DIR = path.join(TMP, 'mirror');
  // dynamic import — merkle reads the key env var at module-load time
  chain = (await import('../../src/security/ledger/chain.js')).default;
  merkle = (await import('../../src/security/ledger/merkle.js')).default;
  sink = (await import('../../src/security/ledger/sink.js')).default;
});
afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

let db;

beforeEach(() => {
  db = openDatabase(':memory:');
  chain.init(db);
  merkle.init(db);
});

describe('ledger chain', () => {
  it('appends entries with a deterministic hash chain', () => {
    const a = chain.append('G', 'U1', 'ban', 'X', { reason: 'r' }, 1000);
    const b = chain.append('G', 'U2', 'kick', 'Y', {}, 2000);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.prev_hash).toBe(a.hash);
    expect(chain.lastEntry().seq).toBe(2);
    expect(chain.count()).toBe(2);
  });

  it('verifies an untouched chain', () => {
    chain.append('G', 'U1', 'ban', 'X', {}, 1000);
    chain.append('G', 'U1', 'ban', 'Y', {}, 2000);
    chain.append('H', 'U1', 'kick', 'Z', {}, 3000);
    const global = chain.verify();
    expect(global.ok).toBe(true);
    expect(global.entries).toBe(3);
    const scoped = chain.verify('G');
    expect(scoped.ok).toBe(true);
  });

  it('detects a tampered row', () => {
    chain.append('G', 'U1', 'ban', 'X', {}, 1000);
    chain.append('G', 'U1', 'ban', 'Y', {}, 2000);
    db.prepare('UPDATE audit_ledger SET action = ? WHERE seq = 1').run('forgery');
    const res = chain.verify();
    expect(res.ok).toBe(false);
    expect(res.gap.flaw).toBe('hash');
    expect(res.gap.seq).toBe(1);
  });

  it('detects a broken prev-link', () => {
    chain.append('G', 'U1', 'ban', 'X', {}, 1000);
    chain.append('G', 'U1', 'ban', 'Y', {}, 2000);
    db.prepare('UPDATE audit_ledger SET prev_hash = ? WHERE seq = 2').run('0'.repeat(64));
    const res = chain.verify();
    expect(res.ok).toBe(false);
    expect(res.gap.flaw).toBe('prev-link');
  });

  it('queries with filters and ordering', () => {
    chain.append('G', 'ALICE', 'ban', 'X', {}, 1000);
    chain.append('G', 'BOB', 'kick', 'Y', {}, 2000);
    chain.append('G', 'ALICE', 'kick', 'Z', {}, 3000);
    chain.append('H', 'ALICE', 'ban', 'W', {}, 4000);
    expect(chain.query({ guildId: 'G', actor: 'ALICE' })).toHaveLength(2);
    expect(chain.query({ guildId: 'G', action: 'kick' })).toHaveLength(2);
    expect(chain.query({ guildId: 'G' })).toHaveLength(3);
    const rows = chain.query({ guildId: 'G', limit: 2 });
    expect(rows[0].action === 'kick' || rows[0].seq === 3).toBe(true); // DESC order
  });
});

describe('ledger merkle anchoring', () => {
  it('dayKey produces an integer YYYYMMDD', () => {
    expect(merkle.dayKey(new Date('2026-09-21T12:00:00Z').getTime())).toBe(20260921);
  });

  it('produces deterministic roots and idempotent daily roots', () => {
    chain.append('G', 'U1', 'ban', 'X', {}, 1000);
    chain.append('G', 'U1', 'ban', 'Y', {}, 2000);
    const day = merkle.dayKey(1000);
    const r1 = merkle.buildDailyRoot(1000);
    expect(r1).toBeTruthy();
    expect(r1.root).toMatch(/^[0-9a-f]{64}$/);
    expect(r1.entry_count).toBe(2);
    // idempotent — same day returns stored root
    expect(merkle.buildDailyRoot(1000).root).toBe(r1.root);
    // verify recomputes cleanly
    expect(merkle.verifyDay(day).ok).toBe(true);
    // signature round-trips with the persisted Ed25519 key
    expect(merkle.verifySignature(day)).toBe(true);
  });

  it('verifyDay fails after the ledger is tampered with', () => {
    chain.append('G', 'U1', 'ban', 'X', {}, 1000);
    const day = merkle.dayKey(1000);
    merkle.buildDailyRoot(1000);
    db.prepare('UPDATE audit_ledger SET hash = ? WHERE seq = 1').run('f'.repeat(64));
    const res = merkle.verifyDay(day);
    expect(res.ok).toBe(false);
    // signature still authentic — it signs the STORED root, which is unchanged
    expect(merkle.verifySignature(day)).toBe(true);
  });

  it('merkleRoot composes leaves deterministically', () => {
    expect(merkle.merkleRoot(['a', 'b', 'c'])).toBe(merkle.merkleRoot(['a', 'b', 'c']));
    expect(merkle.merkleRoot(['a', 'b'])).not.toBe(merkle.merkleRoot(['b', 'a']));
    expect(merkle.merkleRoot([])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ledger sink mirror', () => {
  it('mirrors only critical actions to the JSONL file', async () => {
    const file = sink.MIRROR_FILE;
    sink.init({});
    const ban = await sink.mirror({ day: 1, seq: 1, hash: 'h', action: 'ban', guildId: 'G' });
    expect(ban.file).toBe(true);
    const nonCritical = await sink.mirror({ day: 1, seq: 2, hash: 'h2', action: 'message.flagged' });
    expect(nonCritical.mirrored).toBe(false);
    const forced = await sink.mirror({ day: 1, seq: 3, hash: 'h3', action: 'message.flagged' }, { force: true });
    expect(forced.mirrored).toBe(true);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});