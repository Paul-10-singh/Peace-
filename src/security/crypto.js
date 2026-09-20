/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — cryptographic primitives (node:crypto only, zero deps).
 *
 * Used across the zero-trust engine (HMAC capability tokens), the tamper-
 * evident audit ledger (sha256 hash chaining + Ed25519 merkle anchoring),
 * and secret management (scrypt key derivation + AES-256-GCM).
 *
 * Every UTF-8 string is canonicalized before hashing so that byte-for-byte
 * identical logical data always produces identical digests.
 */
const { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv, generateKeyPairSync, sign, verify } = require('crypto');
const { existsSync, readFileSync, writeFileSync } = require('fs');

const SCHEME = 'shax2'; // capability token scheme version (bump = invalidate all tokens)

// Persistent HMAC secret — env override wins; otherwise provisioned once into
// data/security.hmac (0600) so tokens survive restarts and can't be guessed.
let persistedSecret = null;
function hmacSecret() {
  if (process.env.SECURITY_HMAC_SECRET) return process.env.SECURITY_HMAC_SECRET;
  if (persistedSecret) return persistedSecret;
  const file = process.env.SECURITY_HMAC_FILE || require('path').join(__dirname, '..', '..', 'data', 'security.hmac');
  if (existsSync(file)) {
    persistedSecret = readFileSync(file, 'utf8').trim();
    return persistedSecret;
  }
  persistedSecret = randomBytes(32).toString('hex');
  try {
    const dir = file.substring(0, file.lastIndexOf(require('path').sep));
    if (!existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
    writeFileSync(file, persistedSecret, { mode: 0o600 });
  } catch { /* non-fatal: secret remains in-memory for this run */ }
  return persistedSecret;
}

/** sha256 hex digest of a canonicalized value. */
function sha256(data) {
  return createHash('sha256').update(canonical(data)).digest('hex');
}

/** Normalize arbitrary values into a stable byte string. */
function canonical(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  // Objects: canonical JSON with sorted keys -> stable digest regardless of key order.
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return JSON.stringify(sorted);
}

/** Constant-time HMAC-SHA256 over canonical(data). */
function hmacSign(data, secret) {
  return createHmac('sha256', secret || hmacSecret()).update(canonical(data)).digest('hex');
}

/** Constant-time HMAC verification. */
function hmacVerify(data, signature, secret) {
  const expected = hmacSign(data, secret);
  const a = Buffer.from(String(signature), 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Sign a capability grant into an unforgeable token.
 * Token layout:  shax2.<capability>.<guildId>.<principal>.<expiresAt>.<nonce>.<hmac>
 * Only the signer (this bot install) can forge such a token — memory tampering
 * is therefore useless without the signing secret.
 */
function signCapabilityToken({ capability, guildId, principal, expiresAt }) {
  const fields = [capability, guildId, principal, String(Math.floor(expiresAt)), randomBytes(6).toString('hex')];
  const body = fields.join('.');
  return `${SCHEME}.${body}.${hmacSign(body, hmacSecret())}`;
}

/** Parse + verify a capability token. Returns fields or null. */
function verifyCapabilityToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 7 || parts[0] !== SCHEME) return null;
  const body = parts.slice(1, 6).join('.');
  const provided = parts[6];
  if (!hmacVerify(body, provided, process.env.SECURITY_HMAC_SECRET)) return null;
  const expiresAt = Number(parts[4]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { capability: parts[1], guildId: parts[2], principal: parts[3], expiresAt };
}

/** Random hex string (salt / nonce). */
function randomHex(bytes = 16) {
  return randomBytes(bytes).toString('hex');
}

/** Derive a 32-byte key from a master passphrase using scrypt (OWASP params). */
function deriveKey(passphrase, salt) {
  return scryptSync(String(passphrase), salt, 32, { N: 16384, r: 8, p: 1 });
}

/** AES-256-GCM encrypt -> base64 "iv:tag:ciphertext". */
function aesGcmEncrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** AES-256-GCM decrypt (throws on tamper/failure). */
function aesGcmDecrypt(payload, key) {
  const [iv, tag, data] = String(payload).split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Ed25519 signing keypair (public key printed in hex). */
function ed25519KeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKey, privateKey, publicHex: publicKey.export({ type: 'spki', format: 'der' }).toString('hex') };
}

/** Ed25519 sign (returns base64 signature). */
function ed25519Sign(data, privateKey) {
  return sign(null, Buffer.from(canonical(data), 'utf8'), privateKey).toString('base64');
}

/** Ed25519 verify. `publicKey` may be a KeyObject or an spki-der hex string. */
function ed25519Verify(data, signature, publicKey) {
  try {
    const key = typeof publicKey === 'string' ? { key: Buffer.from(publicKey, 'hex'), type: 'spki', format: 'der' } : publicKey;
    return verify(null, Buffer.from(canonical(data), 'utf8'), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/** SHA-256 of normalized text (used for the known-bad content hash DB). */
function contentHash(text) {
  return createHash('sha256').update(String(text).toLowerCase().replace(/\s+/g, ' ').trim(), 'utf8').digest('hex');
}

module.exports = {
  SCHEME,
  sha256,
  canonical,
  hmacSign,
  hmacVerify,
  signCapabilityToken,
  verifyCapabilityToken,
  randomHex,
  deriveKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
  ed25519KeyPair,
  ed25519Sign,
  ed25519Verify,
  contentHash,
};