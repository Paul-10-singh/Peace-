/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 4 : BLOOM FILTER (O(1) KNOWN-BAD URL LOOKUP).
 *
 * Uses npm `bloom-filters` when present; otherwise a compact built-in
 * implementation keeps the same interface. The filter is rebuilt from the
 * intel_urls table on each feed sync, so membership checks never hit SQL.
 */
let BloomFilterJS = null;
try { ({ BloomFilter: BloomFilterJS } = require('bloom-filters')); } catch { BloomFilterJS = null; }

const { sha256 } = require('../crypto');

function stableHashFns(k, seedBits) {
  // deterministic double-hash family from a single sha256 seed
  return (str) => {
    const h = sha256(`${seedBits}:${str}`);
    const out = [];
    for (let i = 0; i < k; i += 1) out.push(parseInt(h.slice((i * 8) % 56, (i * 8) % 56 + 8), 16));
    return out;
  };
}

/** Minimal built-in bloom (m bits, k hashes). */
function createBuiltIn(numItems, fp = 0.01) {
  const m = Math.ceil(-(numItems * Math.log(fp)) / (Math.LN2 * Math.LN2));
  const k = Math.max(1, Math.ceil((m / numItems) * Math.LN2));
  const bits = new Uint8Array(Math.ceil(m / 8));
  const hasher = stableHashFns(k, `${m}:${k}`);
  return {
    advise: { m, k },
    add(item) {
      const h = hasher(String(item));
      for (const idx of h) bits[Math.floor(idx % m / 8)] |= 1 << (idx % 8);
    },
    has(item) {
      const h = hasher(String(item));
      for (const idx of h) if (!(bits[Math.floor(idx % m / 8)] & (1 << (idx % 8)))) return false;
      return true;
    },
    size() { return m; },
  };
}

function createBloom(numItems = 100_000) {
  if (BloomFilterJS) {
    const f = BloomFilterJS.create(numItems, 0.01);
    return {
      advise: { lib: 'bloom-filters', numItems },
      add: (item) => f.add(item),
      has: (item) => f.has(item),
      size: () => numItems,
    };
  }
  return createBuiltIn(numItems);
}

/**
 * Rebuild a bloom filter from the intel_urls table (hosts + urls).
 * `db` is the security SQLite handle. Returns the filter instance.
 */
function fromDb(db, numItems = 200_000) {
  const filter = createBloom(numItems);
  try {
    const rows = db.prepare('SELECT host, url FROM intel_urls').all();
    for (const row of rows) {
      filter.add(String(row.host).toLowerCase());
      if (row.url) filter.add(String(row.url).toLowerCase());
    }
  } catch { /* empty filter on first boot is fine */ }
  return filter;
}

module.exports = { createBloom, createBuiltIn, fromDb };