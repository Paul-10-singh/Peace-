/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 10 : CREDENTIAL / SECRET MANAGEMENT.
 *
 * Secrets (optional AI keys, relay tokens, mirror credentials) can be stored
 * encrypted in data/secrets.enc with AES-256-GCM, key derived via scrypt from
 * a master passphrase (SECURITY_MASTER_PASSPHRASE). Plaintext environment
 * variables remain supported — encryption is opt-in.
 */
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { deriveKey, aesGcmEncrypt, aesGcmDecrypt, randomHex } = require('./crypto');
const { join } = require('path');

const FILE = process.env.SECURITY_SECRETS_FILE || join(__dirname, '..', '..', 'data', 'secrets.enc');
const store = new Map();

function masterKey() {
  const pass = process.env.SECURITY_MASTER_PASSPHRASE;
  if (!pass) return null;
  const salt = process.env.SECURITY_MASTER_SALT || 'peacex-default-salt';
  return deriveKey(pass, salt);
}

function load() {
  store.clear();
  const key = masterKey();
  if (!key || !existsSync(FILE)) return store;
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8'));
    const dec = aesGcmDecrypt(raw.cipher, key);
    const data = JSON.parse(dec);
    for (const [k, v] of Object.entries(data)) store.set(k, v);
  } catch {
    console.error('[PeaceX] [Secrets] Failed to decrypt secrets.enc — using env only.');
  }
  return store;
}

function save() {
  const key = masterKey();
  if (!key) return false;
  const dir = FILE.substring(0, FILE.lastIndexOf(require('path').sep));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(Object.fromEntries(store));
  const cipher = aesGcmEncrypt(payload, key);
  writeFileSync(FILE, JSON.stringify({ v: 2, salt: process.env.SECURITY_MASTER_SALT || 'peacex-default-salt', cipher }), { mode: 0o600 });
  return true;
}

/** getSecret: env var wins (runtime rotation), then encrypted store. */
function getSecret(name, fallback = null) {
  return process.env[name] || store.get(name) || fallback;
}

function setSecret(name, value) {
  store.set(name, value);
  return save();
}

function hasEncryptedStore() { return existsSync(FILE); }

module.exports = { load, save, getSecret, setSecret, hasEncryptedStore, FILE };