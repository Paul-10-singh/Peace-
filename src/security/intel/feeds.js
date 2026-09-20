/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 4 : THREAT INTELLIGENCE FEEDS.
 *
 * Syncs every 6h:
 *   - PhishTank CSV          https://data.phishtank.com/data/<apikey>/online-valid.csv
 *   - OpenPhish feed         https://openphish.com/feed.txt
 *   - URLhaus               https://urlhaus.abuse.ch/downloads/csv_recent/
 *   - Google Safe Browsing  https://safebrowsing.googleapis.com/v4/...
 *
 * Parsed URLs are hashed into intel_urls + reloaded into the bloom filter.
 * Every fetch is guarded: a failing feed never crashes the bot, and each
 * source's payload is validated before inserts.
 */
const { contentHash } = require('../crypto');
const bloom = require('./bloom');

let DB = null;
let activeFilter = null;
let lastSync = 0;
const SYNC_INTERVAL = 6 * 60 * 60 * 1000;
const sources = { phishtank: 0, openphish: 0, urlhaus: 0, gsb: 0, report: 0 };

function init(db) {
  DB = db;
  activeFilter = bloom.fromDb(DB);
  return feedsApi;
}

function knownBad(urlOrHost) {
  if (!activeFilter) return false;
  const clean = String(urlOrHost).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  return activeFilter.has(urlOrHost.toLowerCase()) || activeFilter.has(clean);
}

function normalizeHost(raw) {
  try {
    if (/^https?:/i.test(raw)) return new URL(raw).hostname.toLowerCase();
    return raw.toLowerCase().split('/')[0];
  } catch {
    return null;
  }
}

async function fetchText(url, okCodes = [200]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'PeaceX-security/1.0' } });
    clearTimeout(timer);
    if (!okCodes.includes(res.status)) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function insertUrl(url, source, category = null) {
  if (!DB) return false;
  const host = normalizeHost(url);
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return false;
  const hash = contentHash(url);
  DB.prepare(`
    INSERT OR IGNORE INTO intel_urls (url_hash, url, host, source, category, first_seen)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(hash, String(url).slice(0, 1000), host, source, category, Date.now());
  sources[source] = (sources[source] || 0) + 1;
  return true;
}

async function syncPhishTank() {
  const key = process.env.PHISHTANK_API_KEY;
  if (!key) return 0;
  const csv = await fetchText(`https://data.phishtank.com/data/${encodeURIComponent(key)}/online-valid.csv`);
  let n = 0;
  for (const line of csv.split('\n').slice(1)) {
    const url = line.split(',')[1]?.replace(/^"|"$/g, '');
    if (url) { if (insertUrl(url, 'phishtank', 'phish')) n += 1; }
  }
  return n;
}

async function syncOpenPhish() {
  const text = await fetchText('https://openphish.com/feed.txt');
  let n = 0;
  for (const line of text.split('\n')) {
    if (line.trim() && /^https?:/i.test(line.trim()) && insertUrl(line.trim(), 'openphish', 'phish')) n += 1;
  }
  return n;
}

async function syncUrlhaus() {
  const csv = await fetchText('https://urlhaus.abuse.ch/downloads/csv_recent/', [200]);
  let n = 0;
  const lines = csv.split('\n').slice(4); // skip 3 comment lines + header
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const url = cols[2]?.replace(/^"|"$/g, '');
    const tag = cols[7]?.replace(/^"|"$/g, '');
    if (url && insertUrl(url, 'urlhaus', tag || 'malware')) n += 1;
  }
  return n;
}

async function syncGsb() {
  const key = process.env.GSB_API_KEY;
  if (!key) return 0;
  // batch lookup of our own flagged hosts (usage-light)
  const hosts = DB.prepare(
    'SELECT DISTINCT host FROM intel_urls ORDER BY first_seen DESC LIMIT 100'
  ).all().map((r) => r.host);
  if (!hosts.length) return 0;
  const body = {
    client: { clientId: 'peacex-bot', clientVersion: '1.0.0' },
    threatInfo: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING'], platformTypes: ['ANY_PLATFORM'], threatEntries: hosts.map((url) => ({ url: `http://${url}` })) },
  };
  const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => null);
  const matches = json?.matches || [];
  for (const match of matches) {
    const u = match?.threat?.url || '';
    if (u) insertUrl(u, 'gsb', match.threatType || null);
  }
  return matches.length;
}

/** Add a user-reported scam URL (via /report). */
function reportUrl(url, reportedBy = null) {
  const ok = insertUrl(url, 'report', 'user-report');
  rebuildFilter();
  return ok;
}

/** Full sync cycle; returns per-source counts. Safe to call regularly. */
async function syncAll({ force = false } = {}) {
  if (!DB) return sources;
  if (!force && Date.now() - lastSync < SYNC_INTERVAL) return sources;
  const before = { ...sources };
  const jobs = [];
  if (process.env.PHISHTANK_API_KEY) jobs.push(syncPhishTank().catch(() => 0));
  jobs.push(syncOpenPhish().catch(() => 0));
  jobs.push(syncUrlhaus().catch(() => 0));
  if (process.env.GSB_API_KEY) jobs.push(syncGsb().catch(() => 0));
  await Promise.all(jobs);
  rebuildFilter();
  lastSync = Date.now();
  const after = { ...sources };
  for (const k of Object.keys(after)) after[k] -= before[k] || 0;
  return after;
}

function rebuildFilter() {
  if (DB) activeFilter = bloom.fromDb(DB);
}

function ageOf(host) {
  if (!DB) return null;
  const row = DB.prepare('SELECT MIN(first_seen) AS s FROM intel_urls WHERE host = ?').get(host.toLowerCase());
  return row ? Date.now() - row.s : null;
}

function disable() { activeFilter = null; lastSync = 0; }

const feedsApi = { init, syncAll, reportUrl, knownBad, rebuildFilter, ageOf, sources, disable };

module.exports = feedsApi;