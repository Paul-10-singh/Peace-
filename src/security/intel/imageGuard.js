/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 4 : SCAM IMAGE GUARD (SHA-256 + 64-bit dHash Hybrid).
 *
 * Combines two complementary image fingerprinting techniques:
 *   1. Exact SHA-256 hash — catches exact reposts/copies in < 1ms.
 *   2. Perceptual 64-bit dHash (via ffmpeg-static 9x8 grayscale scale) —
 *      catches resized, recompressed (PNG <-> JPG/WEBP), or screenshot
 *      variants of the blocked scam image via Hamming distance.
 *
 * Includes a low-variance guard so blank/solid-color images never match
 * unrelated solid images via dHash (falling back to SHA-256 exact match).
 */
const crypto = require('crypto');
const { spawn } = require('child_process');
const net = require('net');
const ffmpegPath = require('ffmpeg-static');

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_FFMPEG_TIMEOUT_MS = 6000;
const DEFAULT_MAX_DISTANCE = 6; // out of 64 bits (~90.6% visual similarity)
const MIN_VARIANCE_RANGE = 10; // grayscale 0..255 range below which image is solid/blank

let DB = null;
let isDisabled = false;
let nextMemId = 1;
const guildCache = new Map(); // guildId -> Array<BlockedImageRow>
const memoryStore = new Map(); // fallback when DB is not initialized
const pendingUploads = new Set(); // `${guildId}:${userId}`
const ignoredMessages = new Set(); // messageId grace skip (e.g. panel upload messages)

function init(db) {
  DB = db;
  isDisabled = false;
  guildCache.clear();
  return imageGuardApi;
}

function disable() {
  isDisabled = true;
  guildCache.clear();
}

function enable() {
  isDisabled = false;
}

function isPrivateIpOrHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  } else if (ipVersion === 6) {
    const clean = host.replace(/^\[|\]$/g, '');
    if (clean === '::1' || clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80')) {
      return true;
    }
  }
  return false;
}

function isSafeRemoteUrl(urlStr) {
  try {
    const parsed = new URL(String(urlStr || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (isPrivateIpOrHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(urlStr, { maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, maxRedirects = 3 } = {}) {
  let currentUrl = urlStr;
  let res;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (!isSafeRemoteUrl(currentUrl)) {
      throw new Error('Invalid or unsafe image URL (must be a public http/https URL).');
    }

    res = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'PeaceX-ImageGuard/1.0' },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers?.get?.('location');
      if (!location) throw new Error(`Redirect without Location header (HTTP ${res.status}).`);
      currentUrl = new URL(location, currentUrl).toString();
      if (hop === maxRedirects) throw new Error('Too many redirects while fetching image.');
      continue;
    }
    break;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch image (HTTP ${res.status}).`);
  }

  const lenHeader = Number(res.headers?.get?.('content-length') || 0);
  if (lenHeader > maxBytes) {
    throw new Error(`Image exceeds max allowed size (${Math.round(maxBytes / (1024 * 1024))} MB).`);
  }

  const reader = res.body?.getReader?.();
  if (!reader) {
    const arr = await res.arrayBuffer();
    const buf = Buffer.from(arr);
    if (buf.length > maxBytes) throw new Error('Image exceeds max allowed size.');
    return buf;
  }

  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`Image exceeds max allowed size (${Math.round(maxBytes / (1024 * 1024))} MB).`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function extractGrayscale9x8(buffer, timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(new Error('ffmpeg-static binary not available.'));
    }

    const proc = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vf', 'scale=9:8:flags=area',
      '-frames:v', '1',
      '-f', 'rawvideo',
      '-pix_fmt', 'gray',
      'pipe:1',
    ]);

    const chunks = [];
    let errText = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGKILL'); } catch {}
      reject(new Error('Image decoding timed out.'));
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => { errText += chunk.toString(); });
    proc.stdin.on('error', () => {});

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      if (code === 0 && out.length >= 72) {
        resolve(out.subarray(0, 72));
      } else {
        reject(new Error(errText.trim() || `Unsupported or corrupted image (code ${code}).`));
      }
    });

    proc.stdin.end(buffer);
  });
}

function computeDHashFromGray9x8(pixels) {
  if (!pixels || pixels.length < 72) {
    throw new Error('Need at least 72 grayscale pixels (9x8) for dHash.');
  }

  let minVal = 255;
  let maxVal = 0;
  for (let i = 0; i < 72; i++) {
    const p = pixels[i];
    if (p < minVal) minVal = p;
    if (p > maxVal) maxVal = p;
  }

  let hex = '';
  let nibble = 0;
  let bitCount = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = pixels[y * 9 + x];
      const right = pixels[y * 9 + x + 1];
      nibble = (nibble << 1) | (left > right ? 1 : 0);
      bitCount += 1;
      if (bitCount === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bitCount = 0;
      }
    }
  }

  return {
    dhash: hex,
    lowVar: maxVal - minVal < MIN_VARIANCE_RANGE ? 1 : 0,
  };
}

function hammingDistance(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== 16 || hexB.length !== 16) return 64;
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

async function fingerprintBuffer(buffer, { strictDecode = true } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Empty image buffer.');
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  try {
    const pixels = await extractGrayscale9x8(buffer);
    const { dhash, lowVar } = computeDHashFromGray9x8(pixels);
    return { sha256, dhash, lowVar };
  } catch (err) {
    if (strictDecode) throw err;
    return { sha256, dhash: '0000000000000000', lowVar: 1 };
  }
}

function list(guildId) {
  if (!guildId) return [];
  if (DB) {
    if (!guildCache.has(guildId)) {
      const rows = DB.prepare(
        'SELECT * FROM blocked_images WHERE guild_id = ? ORDER BY created_at DESC'
      ).all(guildId);
      guildCache.set(guildId, rows);
    }
    return guildCache.get(guildId);
  }
  return memoryStore.get(guildId) || [];
}

function invalidateCache(guildId) {
  guildCache.delete(guildId);
}

function hasBlockedImages(guildId) {
  if (isDisabled || !guildId) return false;
  return list(guildId).length > 0;
}

async function blockFromBuffer(guildId, buffer, { label = null, sourceUrl = null, addedBy = null } = {}) {
  if (!guildId) throw new Error('Guild ID is required.');
  const cleanLabel = label ? String(label).trim().slice(0, 80) : null;
  const cleanSourceUrl = sourceUrl ? String(sourceUrl).slice(0, 500) : null;
  const { sha256, dhash, lowVar } = await fingerprintBuffer(buffer, { strictDecode: true });
  const now = Date.now();

  if (DB) {
    const existing = DB.prepare(
      'SELECT * FROM blocked_images WHERE guild_id = ? AND sha256 = ?'
    ).get(guildId, sha256);

    if (existing) {
      if (cleanLabel || cleanSourceUrl) {
        DB.prepare(
          'UPDATE blocked_images SET label = COALESCE(?, label), source_url = COALESCE(?, source_url) WHERE id = ?'
        ).run(cleanLabel, cleanSourceUrl, existing.id);
      }
      invalidateCache(guildId);
      const updated = DB.prepare('SELECT * FROM blocked_images WHERE id = ?').get(existing.id);
      return { entry: updated, alreadyExists: true };
    }

    const info = DB.prepare(`
      INSERT INTO blocked_images (guild_id, sha256, dhash, low_var, label, source_url, added_by, hits, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(guildId, sha256, dhash, lowVar, cleanLabel, cleanSourceUrl, addedBy, now);

    invalidateCache(guildId);
    const entry = DB.prepare('SELECT * FROM blocked_images WHERE id = ?').get(info.lastInsertRowid);
    return { entry, alreadyExists: false };
  }

  // Fallback in-memory storage
  const items = memoryStore.get(guildId) || [];
  const existing = items.find((i) => i.sha256 === sha256);
  if (existing) {
    if (cleanLabel) existing.label = cleanLabel;
    return { entry: existing, alreadyExists: true };
  }
  const entry = {
    id: nextMemId++,
    guild_id: guildId,
    sha256,
    dhash,
    low_var: lowVar,
    label: cleanLabel,
    source_url: sourceUrl,
    added_by: addedBy,
    hits: 0,
    created_at: now,
  };
  memoryStore.set(guildId, [entry, ...items]);
  return { entry, alreadyExists: false };
}

async function blockFromUrl(guildId, url, meta = {}) {
  const buffer = await downloadImage(url);
  return blockFromBuffer(guildId, buffer, { ...meta, sourceUrl: url });
}

function remove(guildId, idOrShaPrefix) {
  if (!guildId || !idOrShaPrefix) return false;
  const target = String(idOrShaPrefix).trim();

  if (DB) {
    let info;
    if (/^\d+$/.test(target)) {
      info = DB.prepare('DELETE FROM blocked_images WHERE guild_id = ? AND id = ?').run(guildId, Number(target));
    } else {
      info = DB.prepare('DELETE FROM blocked_images WHERE guild_id = ? AND sha256 LIKE ?').run(guildId, `${target}%`);
    }
    invalidateCache(guildId);
    return info.changes > 0;
  }

  const items = memoryStore.get(guildId) || [];
  const next = items.filter((e) => String(e.id) !== target && !e.sha256.startsWith(target));
  if (next.length === items.length) return false;
  memoryStore.set(guildId, next);
  return true;
}

function clear(guildId) {
  if (!guildId) return 0;
  if (DB) {
    const info = DB.prepare('DELETE FROM blocked_images WHERE guild_id = ?').run(guildId);
    invalidateCache(guildId);
    return info.changes;
  }
  const count = (memoryStore.get(guildId) || []).length;
  memoryStore.delete(guildId);
  return count;
}

function recordHit(guildId, entry) {
  if (!entry) return;
  entry.hits = (entry.hits || 0) + 1;
  if (DB && entry.id) {
    try {
      DB.prepare('UPDATE blocked_images SET hits = hits + 1 WHERE id = ?').run(entry.id);
    } catch {}
  }
}

async function matchBuffer(guildId, buffer, { maxDistance = DEFAULT_MAX_DISTANCE } = {}) {
  if (isDisabled || !guildId) return null;
  const entries = list(guildId);
  if (!entries.length) return null;

  const { sha256, dhash, lowVar } = await fingerprintBuffer(buffer, { strictDecode: false });

  // Concept 2: Exact SHA-256 check
  const exact = entries.find((e) => e.sha256 === sha256);
  if (exact) {
    recordHit(guildId, exact);
    return { matched: true, method: 'sha256', distance: 0, similarity: 100, entry: exact };
  }

  // Concept 1: Perceptual dHash check (skip solid/blank low-variance images)
  if (!lowVar) {
    let bestMatch = null;
    let bestDist = Infinity;

    for (const entry of entries) {
      if (entry.low_var) continue;
      const dist = hammingDistance(dhash, entry.dhash);
      if (dist <= maxDistance && dist < bestDist) {
        bestDist = dist;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      recordHit(guildId, bestMatch);
      return {
        matched: true,
        method: 'dhash',
        distance: bestDist,
        similarity: Math.round(((64 - bestDist) / 64) * 100),
        entry: bestMatch,
      };
    }
  }

  return null;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif)(\?|#|$)/i;

function isImageAttachment(att) {
  if (!att?.url) return false;
  const ct = (att.contentType || '').toLowerCase();
  if (ct) {
    if (ct.startsWith('image/')) return true;
    if (ct !== 'application/octet-stream') return false;
  }
  if (IMAGE_EXT_RE.test(att.name || '') || IMAGE_EXT_RE.test(att.url)) return true;
  if (!ct && typeof att.width === 'number' && att.width > 0) return true;
  return false;
}

function extractMessageImageUrls(message) {
  const urls = [];
  const seen = new Set();
  const add = (u) => {
    if (!u || seen.has(u)) return;
    if (!isSafeRemoteUrl(u)) return;
    seen.add(u);
    urls.push(u);
  };

  if (message?.attachments) {
    const values = typeof message.attachments.values === 'function'
      ? message.attachments.values()
      : Object.values(message.attachments);
    for (const att of values) {
      if (isImageAttachment(att)) add(att.url);
    }
  }

  if (Array.isArray(message?.embeds)) {
    for (const emb of message.embeds) {
      if (emb?.image?.url) add(emb.image.url);
      if (emb?.thumbnail?.url) add(emb.thumbnail.url);
    }
  }

  if (message?.content) {
    const matches = message.content.match(/https?:\/\/[^\s<>()]+/gi) || [];
    for (const url of matches) {
      if (IMAGE_EXT_RE.test(url)) add(url);
    }
  }

  return urls.slice(0, 5);
}

function uploadKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function markPendingUpload(guildId, userId) {
  if (guildId && userId) pendingUploads.add(uploadKey(guildId, userId));
}

function clearPendingUpload(guildId, userId) {
  if (guildId && userId) pendingUploads.delete(uploadKey(guildId, userId));
}

function ignoreMessage(messageId) {
  if (!messageId) return;
  ignoredMessages.add(messageId);
  const t = setTimeout(() => ignoredMessages.delete(messageId), 30_000);
  if (typeof t.unref === 'function') t.unref();
}

async function checkMessageImages(message, { maxDistance = DEFAULT_MAX_DISTANCE } = {}) {
  if (isDisabled || !message?.guild) return null;
  if (ignoredMessages.has(message.id)) return null;
  if (pendingUploads.has(uploadKey(message.guild.id, message.author?.id))) return null;
  if (!hasBlockedImages(message.guild.id)) return null;

  const urls = extractMessageImageUrls(message);
  if (!urls.length) return null;

  for (const url of urls) {
    try {
      const buffer = await downloadImage(url);
      const match = await matchBuffer(message.guild.id, buffer, { maxDistance });
      if (match?.matched) {
        return { hit: true, url, ...match };
      }
    } catch {
      // Ignore unreachable or non-image URLs
    }
  }

  return null;
}

const imageGuardApi = {
  init,
  disable,
  enable,
  isSafeRemoteUrl,
  downloadImage,
  extractGrayscale9x8,
  computeDHashFromGray9x8,
  hammingDistance,
  fingerprintBuffer,
  list,
  hasBlockedImages,
  blockFromBuffer,
  blockFromUrl,
  remove,
  clear,
  matchBuffer,
  extractMessageImageUrls,
  checkMessageImages,
  markPendingUpload,
  clearPendingUpload,
  ignoreMessage,
  DEFAULT_MAX_DISTANCE,
};

module.exports = imageGuardApi;
