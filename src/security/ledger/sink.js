/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 6 : SECONDARY SINK (MIRROR).
 *
 * Critical events (bans, account takeovers, capability grants, nuke/raid
 * incidents) are mirrored to an append-only JSONL file and — when an S3 /
 * Backblaze B2 bucket is configured — to object storage. The mirror is a
 * defensive copy: even if the SQLite file is wiped, the ordered stream
 * survives off-box.
 */
const { appendFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const CRITICAL = new Set(['ban', 'kick', 'nuke', 'raid', 'capability.grant', 'capability.revoke', 'incident.open', 'incident.rollback', 'gbans.ban']);

const MIRROR_DIR = process.env.SECURITY_MIRROR_DIR || join(__dirname, '..', '..', '..', 'data', 'mirror');
const MIRROR_FILE = process.env.SECURITY_MIRROR_FILE || join(MIRROR_DIR, 'ledger.jsonl');

let s3 = null;
let bucket = process.env.SECURITY_MIRROR_S3_BUCKET || null;

/** Initialize the file mirror + optional S3 client. */
function init({ s3Options } = {}) {
  if (!existsSync(MIRROR_DIR)) mkdirSync(MIRROR_DIR, { recursive: true });
  if (bucket && s3Options) {
    try {
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      s3 = { client: new S3Client(s3Options || {}), PutObjectCommand };
    } catch { s3 = null; }
  }
  return sinkApi;
}

function isCritical(action) {
  return CRITICAL.has(action);
}

/** Write one row to the local mirror (append-only). */
function writeLocal(entry) {
  try {
    appendFileSync(MIRROR_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Mirror to S3/B2 as a record-append object if configured. */
async function writeS3(entry) {
  if (!s3 || !bucket) return false;
  try {
    const key = `peacex/security/${String(entry.day || '').padStart(8, '0')}/ledger-${entry.seq || 'x'}-${entry.hash || ''}.jsonl`;
    const body = `${JSON.stringify(entry)}\n`;
    await s3.client.send(new s3.PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirror an audit entry. Only critical actions are mirrored (privacy +
 * cost control). Returns { mirrored, file, s3 }.
 */
async function mirror(entry, { force = false } = {}) {
  if (!force && !isCritical(entry.action)) return { mirrored: false, file: false, s3: false };
  const file = writeLocal(entry);
  const remote = await writeS3(entry);
  return { mirrored: file || remote, file, s3: remote };
}

const sinkApi = { init, mirror, isCritical, MIRROR_FILE };

module.exports = sinkApi;