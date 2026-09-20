/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 6 : DAILY MERKLE ANCHORING.
 *
 * A Merkle tree is built over every entry hash of a calendar day
 * (YYYYMMDD). The root is signed with the bot's Ed25519 key and stored in
 * `merkle_roots`. The signature can be published/anchored externally so a
 * compromised database still cannot rewrite history without the key.
 */
const { createHash } = require('crypto');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { randomHex, ed25519KeyPair, ed25519Sign, ed25519Verify, sha256 } = require('../crypto');

let DB = null;
const KEY_PATH = process.env.SECURITY_ED25519_KEY || `${__dirname}/../../../data/security.sigkey.ed25519`;

function init(db) {
  DB = db;
  return merkleApi;
}

function dayKey(ts) {
  const d = new Date(ts);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return Number(`${d.getUTCFullYear()}${mm}${dd}`);
}

/** Bottom-up merkle root over a list of leaf hashes. */
function merkleRoot(leaves) {
  if (!leaves?.length) return sha256('empty');
  if (leaves.length === 1) return sha256(leaves[0]);
  let level = [...leaves];
  if (level.length % 2) level.push(level[level.length - 1]); // odd -> duplicate last
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      next.push(sha256(`${left}${right}`));
    }
    if (next.length === 1) { level = next; break; }
    if (next.length % 2) next.push(next[next.length - 1]);
    level = next;
  }
  return level[0];
}

function loadOrCreateKey() {
  const dir = KEY_PATH.substring(0, KEY_PATH.lastIndexOf(require('path').sep));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (existsSync(KEY_PATH)) {
    return JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  }
  const { privateKey, publicKey, publicHex } = ed25519KeyPair();
  const pem = { label: 'PeaceX-security-merkle', privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }), publicHex, nonce: randomHex(8) };
  writeFileSync(KEY_PATH, JSON.stringify(pem, null, 2), { mode: 0o600 });
  return pem;
}

function signer() {
  return loadOrCreateKey();
}

/**
 * Build + sign today's merkle root (or the day of `ts`). Idempotent per day.
 * Returns { day, root, signature, entry_count }.
 */
function buildDailyRoot(ts = Date.now()) {
  if (!DB) return null;
  const day = dayKey(ts);
  const existing = DB.prepare('SELECT * FROM merkle_roots WHERE day = ?').get(day);
  if (existing) return existing;

  const start = new Date(ts);
  start.setUTCHours(0, 0, 0, 0);
  const end = start.getTime() + 86_400_000;
  const hashes = DB.prepare(
    'SELECT hash FROM audit_ledger WHERE ts >= ? AND ts < ? ORDER BY seq ASC'
  ).all(start.getTime(), end).map((r) => r.hash);

  const root = merkleRoot(hashes);
  const key = signer();
  const signature = ed25519Sign(`merkle:${day}:${root}`, key.privateKeyPem);

  DB.prepare(`
    INSERT INTO merkle_roots (day, root, signature, public_key_hex, entry_count, built_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(day, root, signature, key.publicHex, hashes.length, Date.now());

  return DB.prepare('SELECT * FROM merkle_roots WHERE day = ?').get(day);
}

/** Verify a stored root against the ledger entries of that day. */
function verifyDay(day) {
  if (!DB) return { ok: false, reason: 'no-db' };
  const stored = DB.prepare('SELECT * FROM merkle_roots WHERE day = ?').get(day);
  if (!stored) return { ok: false, reason: 'no-root' };
  const start = new Date(2000, 0, 1, 0, 0, 0, 0);
  start.setUTCFullYear(Math.floor(day / 10000), Math.floor((day % 10000) / 100) - 1, day % 100);
  start.setUTCHours(0, 0, 0, 0);
  const end = start.getTime() + 86_400_000;
  const hashes = DB.prepare(
    'SELECT hash FROM audit_ledger WHERE ts >= ? AND ts < ? ORDER BY seq ASC'
  ).all(start.getTime(), end).map((r) => r.hash);
  const recomputed = merkleRoot(hashes);
  return { ok: recomputed === stored.root, stored: stored.root, recomputed };
}

/** Verify a previous day's signature against the public key. */
function verifySignature(day) {
  if (!DB) return false;
  const stored = DB.prepare('SELECT * FROM merkle_roots WHERE day = ?').get(day);
  if (!stored) return false;
  const key = {};
  try { Object.assign(key, JSON.parse(readFileSync(KEY_PATH, 'utf8'))); } catch { return false; }
  return ed25519Verify(`merkle:${day}:${stored.root}`, stored.signature, stored.public_key_hex);
}

const merkleApi = { init, buildDailyRoot, verifyDay, verifySignature, merkleRoot, dayKey, loadOrCreateKey };

module.exports = merkleApi;