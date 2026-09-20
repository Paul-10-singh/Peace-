/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 9 : HEALTH CHECKS.
 *
 * Reports DB / Redis / AI-model / Discord gateway readiness. Consumed by the
 * /healthz endpoint and by alert rules. Never throws — a broken dependency
 * is reported as `healthy:false` so the bot keeps serving.
 */
let DB = null;
let redisBackend = null;
let clientPtr = null;

function init({ db, client } = {}) {
  DB = db;
  clientPtr = client;
  return healthApi;
}

async function checkGateway() {
  if (!clientPtr?.ws) return { healthy: false, latencyMs: null, reason: 'gateway-unavailable' };
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ healthy: false, latencyMs: null, reason: 'ping-timeout' }), 3000);
    try {
      clientPtr.ping();
      setTimeout(() => { clearTimeout(timer); resolve({ healthy: true, latencyMs: Date.now() - started }); }, 10);
    } catch (err) {
      clearTimeout(timer);
      resolve({ healthy: false, latencyMs: null, reason: err.message });
    }
  });
}

async function report({ withGateway = true } = {}) {
  let db = { healthy: false, reason: 'no-db' };
  try {
    if (DB) { DB.prepare('SELECT 1').get(); db = { healthy: true }; }
  } catch (err) { db = { healthy: false, reason: err.message }; }

  let redis = { healthy: false, reason: 'not-configured' };
  try {
    const rl = require('../ratelimit/redis');
    redis = { healthy: rl.usingRedis(), backend: rl.usingRedis() ? 'redis' : 'memory' };
  } catch {}

  let ai = { healthy: false, reason: 'local-ai-disabled' };
  try {
    const classifier = require('../ai/classifier');
    const loaded = await classifier.loadLocalClassifier();
    ai = { healthy: !!loaded, backend: loaded ? 'transformers.js' : 'none' };
  } catch {}

  const gateway = withGateway ? await checkGateway() : { healthy: true };

  // DB + gateway are mandatory; Redis/AI degrade gracefully.
  const ok = db.healthy && gateway.healthy !== false;
  return { ok, db, redis, ai, gateway };
}

const healthApi = { init, report, mcount: (() => {}) };

module.exports = healthApi;