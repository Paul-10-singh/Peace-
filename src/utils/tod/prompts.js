/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare module - prompts.js (Deliverable 3)
 *
 * Prompt pack loader + random picker + R8 no-repeat enforcement.
 *
 * Contracts:
 *   loadAllPacks()                                loads all packs once
 *   getRandomPrompt({ category, intensity, kind,  excludeIds,
 *                     sessionHistory, spicyEnabledAt }) -> prompt | null
 *   getPromptById(id)                             -> prompt | null
 *   listCategories()                              -> category names
 *   getPackSummary()                              -> counts per pack
 *
 * Gating rules:
 *   - Guild intensity tier decides the visible prompt pool:
 *       pg   -> pg only
 *       pg13 -> pg + pg13
 *       r    -> pg + pg13 + r
 *   - spicy pack is SELECTABLE only when ALL hold:
 *       1. guild intensity == 'r'
 *       2. spicyEnabledAt is set (the store's spicy_enabled_at)
 *       3. the 24h lock has expired (now - spicyEnabledAt >= 24h)
 *   - R8 no-repeat: excludeIds (from session history) are never
 *     returned; if the filtered pool is empty, return null so the
 *     caller decides to skip.
 *
 * Load-time validation throws on ANY pack violation: wrong version,
 * fewer than 15 prompts, missing truth/dare mix, duplicate ids (within
 * a pack or across packs), bad kind/intensity tag, text over 200 chars,
 * or non-ASCII text.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const pino = require('pino');
const log = pino({
  name: 'peace-tod',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'peace-tod', developedBy: 'Smith.Code' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const PACKS_DIR = path.join(__dirname, 'packs');
const PACK_FILES = ['funny.json', 'deep.json', 'weird.json', 'party.json', 'spicy.json'];

const SPICY_LOCK_MS = 24 * 60 * 60 * 1000; // 24h spicy gate
const MAX_TEXT_LENGTH = 200;
const MIN_PROMPTS_PER_PACK = 15;

const VALID_KINDS = new Set(['truth', 'dare']);
const VALID_INTENSITIES = new Set(['pg', 'pg13', 'r']);

// Guild preset -> allowed prompt intensity tiers (ascending).
const TIER = { pg: 0, pg13: 1, r: 2 };
const TIER_ALLOW = { pg: ['pg'], pg13: ['pg', 'pg13'], r: ['pg', 'pg13', 'r'] };

let cache = null; // { category: pack, ... }

function isAscii(value) {
  return /^[\x00-\x7F]*$/.test(value);
}

function validatePack(file, raw) {
  const errors = [];

  if (raw.version !== 1) errors.push('version must be 1');
  if (typeof raw.category !== 'string' || raw.category.trim() === '')
    errors.push('missing category');

  if (!Array.isArray(raw.prompts)) {
    errors.push('prompts must be an array');
    return errors;
  }
  if (raw.prompts.length < MIN_PROMPTS_PER_PACK) {
    errors.push(`needs >= ${MIN_PROMPTS_PER_PACK} prompts`);
  }

  const truthCount = raw.prompts.filter((p) => p.kind === 'truth').length;
  const dareCount = raw.prompts.filter((p) => p.kind === 'dare').length;
  if (truthCount === 0 || dareCount === 0) {
    errors.push('needs a mix of truth and dare prompts');
  }

  return errors;
}

function loadAllPacks() {
  if (cache) return cache;

  const loaded = {};
  const seenIds = new Set();

  for (const file of PACK_FILES) {
    const raw = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, file), 'utf8'));

    const errors = validatePack(file, raw);
    if (errors.length > 0) {
      throw new Error(`tod packs: ${file} invalid - ${errors.join('; ')}`);
    }

    const packPrompts = [];
    for (const prompt of raw.prompts) {
      const id = prompt.id;
      if (typeof id !== 'string' || id === '') {
        throw new Error(`tod packs: ${file} has a prompt without an id`);
      }
      if (seenIds.has(id)) {
        throw new Error(`tod packs: duplicate prompt id '${id}' (${file})`);
      }
      seenIds.add(id);

      const text = prompt.text;
      if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) {
        throw new Error(`tod packs: prompt '${id}' text must be <= ${MAX_TEXT_LENGTH} chars`);
      }
      if (!isAscii(text)) {
        throw new Error(`tod packs: prompt '${id}' text must be ASCII-only`);
      }
      if (!VALID_KINDS.has(prompt.kind)) {
        throw new Error(`tod packs: prompt '${id}' has invalid kind '${prompt.kind}'`);
      }
      if (!VALID_INTENSITIES.has(prompt.intensity)) {
        throw new Error(`tod packs: prompt '${id}' has invalid intensity '${prompt.intensity}'`);
      }

      packPrompts.push(prompt);
    }

    loaded[raw.category] = { version: raw.version, category: raw.category, prompts: packPrompts };
  }

  cache = loaded;
  log.info({ packs: Object.keys(loaded).join(', ') }, 'tod packs loaded');
  return cache;
}

// Spicy gate: intensity 'r' + spicy enabled + 24h lock expired.
function isSpicyUnlocked(intensity, spicyEnabledAt, now) {
  if (intensity !== 'r') return false;
  if (!spicyEnabledAt) return false;
  if (now - spicyEnabledAt < SPICY_LOCK_MS) return false;
  return true;
}

// Whisper-simple validation for callers before ANY pack access.
function assertIntensity(intensity) {
  if (!VALID_INTENSITIES.has(intensity)) {
    throw new TypeError(`tod: intensity must be pg|pg13|r (got ${intensity})`);
  }
}

function getRandomPrompt(options) {
  const {
    category,
    intensity = 'pg',
    kind = null,
    excludeIds = [],
    sessionHistory = [],
    spicyEnabledAt = null,
    now = Date.now(),
  } = options || {};

  assertIntensity(intensity);

  const packs = loadAllPacks();
  const exclude = new Set(excludeIds || []);
  if (Array.isArray(sessionHistory)) {
    for (const id of sessionHistory) {
      if (id) exclude.add(id);
    }
  }

  const allowedIntensities = TIER_ALLOW[intensity];
  const categories = category ? [category] : Object.keys(packs);

  const pool = [];
  for (const cat of categories) {
    const pack = packs[cat];
    if (!pack) continue;

    // Spicy only appears when the full lock chain passes.
    if (cat === 'spicy' && !isSpicyUnlocked(intensity, spicyEnabledAt, now)) continue;

    for (const prompt of pack.prompts) {
      if (kind && prompt.kind !== kind) continue;
      if (!allowedIntensities.includes(prompt.intensity)) continue;
      if (exclude.has(prompt.id)) continue;
      pool.push(prompt);
    }
  }

  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getPromptById(id) {
  const packs = loadAllPacks();
  for (const pack of Object.values(packs)) {
    for (const prompt of pack.prompts) {
      if (prompt.id === id) return prompt;
    }
  }
  return null;
}

function listCategories() {
  return Object.keys(loadAllPacks());
}

function getPackSummary() {
  const packs = loadAllPacks();
  const summary = {};
  for (const [category, pack] of Object.entries(packs)) {
    const counts = {
      total: pack.prompts.length,
      truth: 0,
      dare: 0,
      intensities: { pg: 0, pg13: 0, r: 0 },
    };
    for (const p of pack.prompts) {
      counts[p.kind] += 1;
      counts.intensities[p.intensity] += 1;
    }
    summary[category] = counts;
  }
  return summary;
}

module.exports = {
  loadAllPacks,
  getRandomPrompt,
  getPromptById,
  listCategories,
  getPackSummary,
};