/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 4 : DOMAIN RISK (DNS + WHOIS AGE).
 *
 * Fresh domains (< 7 days old) are overwhelmingly where scam infrastructure
 * lives, so pkotsmsd hosts get a high base risk. Lookups are done via a
 * minimal WHOIS-over-TCP-43 client (no dependency) with DNS resolution as a
 * sanity check, and results are cached for 24h.
 */
const net = require('net');
const dns = require('dns').promises;

const WHOIS_SERVERS = ['whois.verisign-grs.com', 'whois.pwhois.org', 'whois.iana.org'];
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function whoisQuery(host, server) {
  return new Promise((resolve) => {
    const sock = net.connect(43, server);
    const timer = setTimeout(() => { sock.destroy(); resolve(null); }, 4000);
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('connect', () => { sock.write(`${host}\r\n`); });
    sock.on('data', (d) => { buf += d; });
    sock.on('close', () => { clearTimeout(timer); resolve(buf); });
    sock.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

function parseCreationDate(raw, host) {
  if (!raw) return null;
  const patterns = [
    /creation\s*date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
    /created[^\n]{0,40}?([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
    /registered[^\n]{0,40}?([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) return Date.parse(m[1]);
  }
  return null;
}

async function creationAgeMs(host) {
  const tld = host.split('.').slice(-1)[0];
  let chosen = WHOIS_SERVERS[0];
  if (['io', 'dev', 'app', 'ai', 'sh', 'gg', 'gg', 'tv'].includes(tld)) chosen = 'whois.nic.' + tld;
  const raw = await whoisQuery(host, chosen);
  const created = parseCreationDate(raw, host);
  if (created) return Date.now() - created;
  // try fallback servers
  for (const server of WHOIS_SERVERS.slice(1)) {
    const r2 = await whoisQuery(host, server);
    const c2 = parseCreationDate(r2, host);
    if (c2) return Date.now() - c2;
  }
  return null;
}

/** 0..1 risk score with { ageMs, fresh, resolves } diagnostics. */
async function domainRisk(host, { now = Date.now() } = {}) {
  const clean = String(host).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (cache.has(clean) && now - cache.get(clean).at < CACHE_TTL) return cache.get(clean).value;

  let resolves = null;
  try { await dns.resolve4(clean); resolves = true; } catch { try { await dns.resolve6(clean); resolves = true; } catch { resolves = false; } }

  let ageMs = null;
  let fresh = false;
  let score = 0;
  if (resolves === false) {
    score = 0.9; // does not resolve -> disposable/typosquat pattern
  } else {
    ageMs = await creationAgeMs(clean);
    fresh = ageMs != null && ageMs < FRESH_MS;
    if (fresh) score = 0.8;
    else if (ageMs != null) score = 0.1;
    else score = 0.5; // unknown age -> moderate
  }

  const value = { score, ageMs, fresh, resolves, host: clean, at: now };
  cache.set(clean, { value, at: now });
  if (cache.size > 5000) cache.clear();
  return value;
}

function disable() { cache.clear(); }

module.exports = { domainRisk, FRESH_MS, disable };