/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 5 : DISTRIBUTED RATE LIMITING.
 *
 * Redis-backed sliding-window limiter (ioredis + Lua) with a zero-dependency
 * in-memory fallback so the platform degrades gracefully when Redis is down.
 *
 * luaSlidingWindow is atomic: a sorted set per key, ZRANGEBYSCORE to drop
 * expired timestamps, count the window, and insert the new one in one script.
 */
let Redis = null;
try { Redis = require('ioredis'); } catch { Redis = null; }

let client = null;
let memory = new Map(); // key -> timestamps[]

function initRedis(options = {}) {
  if (!Redis) return { ok: false, backend: 'memory', reason: 'ioredis-not-installed' };
  try {
    client = new Redis(options.url || process.env.REDIS_URL || null, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      ...options.opts,
    });
    client.on('error', () => { /* fall back to memory on next call */ });
    return { ok: true, backend: 'redis' };
  } catch {
    client = null;
    return { ok: false, backend: 'memory', reason: 'redis-init-failed' };
  }
}

function usingRedis() {
  return !!client && client.status === 'ready';
}

// Atomic sliding-window via single Lua script.
const SLIDING_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGEBYSCORE', key, now - window, now, 'LIMIT', 0, 1)
  local retry = (oldest[1] and (tonumber(oldest[1]) - (now - window))) or 0
  return {0, limit - count, tostring(retry)}
end
redis.call('ZADD', key, now, now .. ':' .. ARGV[4])
redis.call('PEXPIRE', key, window + 1000)
return {1, limit - count - 1, '0'}
`;

function luaSlidingWindow(key, limit, windowMs, now = Date.now()) {
  if (!usingRedis()) return null;
  try {
    const res = client.eval(
      SLIDING_LUA, 1, `rl:${key}`, String(now), String(windowMs), String(limit), String(Math.random() * 1e9)
    );
    return res.then ? res : Promise.resolve(res);
  } catch {
    return null;
  }
}

async function slidingWindow(key, limit, windowMs, now = Date.now()) {
  const lua = await luaSlidingWindow(key, limit, windowMs, now);
  if (lua) {
    const [allowed, remaining, retryMs] = lua;
    return { allowed: allowed === 1, used: limit - remaining, remaining: Math.max(0, remaining), retryAfterMs: Number(retryMs) };
  }

  // ── in-memory fallback (single-instance semantics) ───────────────────────
  const list = (memory.get(key) || []).filter((ts) => now - ts < windowMs);
  if (list.length >= limit) {
    memory.set(key, list);
    return { allowed: false, used: list.length, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - list[0])) };
  }
  list.push(now);
  memory.set(key, list);
  return { allowed: true, used: list.length, remaining: limit - list.length, retryAfterMs: 0 };
}

/** Token bucket on top of the sliding window (used to cap AI/LLM calls/guild). */
async function tokenBucket(key, capacity, refillPerSec, { now = Date.now() } = {}) {
  // approximated with the sliding window: capacity = burst, then per-second allowance
  const { allowed, remaining } = await slidingWindow(`${key}:bucket`, capacity, 60_000, now);
  // refill: a second relaxed check adds headroom smoothly per second
  const perSec = await slidingWindow(`${key}:bucket.sec`, capacity, 1000 * Math.max(1, Math.ceil(capacity / refillPerSec)), now);
  return { allowed: allowed || perSec.allowed, remaining: Math.min(remaining, capacity) };
}

function reset() {
  memory.clear();
}

function disable() {
  memory.clear();
  if (client) { try { client.disconnect(); } catch {} }
  client = null;
}

module.exports = { initRedis, slidingWindow, tokenBucket, usingRedis, reset, disable, SLIDING_LUA };