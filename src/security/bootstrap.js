/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — BOOTSTRAP / ORCHESTRATION.
 *
 * Wires every layer into the client and attaches `client.security`:

 *   .engine     Layer 1  — zero-trust capability engine
 *   .behavior   Layer 2  — Welford baselines + anomaly soft-locks
 *   .ai         Layer 3  — hybrid content analysis (cache + pipeline)
 *   .intel      Layer 4  — threat feeds + bloom + reputation + whois age
 *   .ratelimit  Layer 5  — redis sliding window + joiner fingerprinting
 *   .ledger     Layer 6  — tamper-evident chain + merkle anchoring + mirror
 *   .playbooks  Layer 7  — incident runner + rollback
 *   .nexus      Layer 8  — signed cross-guild gossip
 *   .metrics    Layer 9  — prometheus + healthz
 *   .secrets    Layer 10 — encrypted secret management
 *
 * Graceful degradation is enforced throughout: any optional dependency
 * (Redis, AI models, feeds) failing never crashes the client.
 */
const { openDatabase } = require('./db');
const chain = require('./ledger/chain');
const merkle = require('./ledger/merkle');
const sink = require('./ledger/sink');
const { createEngine } = require('./engine');
const baseline = require('./behavior/baseline');
const anomalies = require('./behavior/anomalies');
const ratelimit = require('./ratelimit/redis');
const fingerprint = require('./ratelimit/fingerprint');
const runner = require('./playbooks/runner');
const verdictCache = require('./ai/cache');
const classifier = require('./ai/classifier');
const feeds = require('./intel/feeds');
const intelRep = require('./intel/reputation');
const domainRisk = require('./intel/domainRisk');
const nexus = require('./nexus/gossip');
const nexusRep = require('./nexus/reputation');
const metrics = require('./observability/metrics');
const health = require('./observability/health');
const secrets = require('./secrets');
const scheduler = require('./scheduler');
const { logger, withTrace } = require('./log');

let started = false;
let activeClient = null;

/**
 * Bootstrap all ten layers onto `client`. Idempotent.
 * Returns client.security.
 */
function bootstrap(client) {
  if (started) return client.security;
  started = true;
  activeClient = client;
  scheduler.bindClient(client);

  secrets.load();
  const ANOMALY = process.env.SECURITY_ANOMALY === '1';
  const db = openDatabase();
  chain.init(db);
  merkle.init(db);
  sink.init();
  baseline.init(db);
  runner.init(db);
  verdictCache.init(db);
  feeds.init(db);
  intelRep.init(db);
  nexusRep.init(db);
  nexus.init(db);
  ratelimit.initRedis();
  health.init({ db, client });

  const engine = createEngine({ db });
  engine.install(client);

  const registry = metrics.registry;

  // ── public facade on client.security ────────────────────────────────────
  client.security = {
    engine,
    behavior: { baseline, anomalies },
    ai: { classifier, cache: verdictCache },
    intel: { feeds, reputation: intelRep, bloom: require('./intel/bloom'), domainRisk },
    ratelimit: { redis: ratelimit, fingerprint },
    ledger: { chain, merkle, sink },
    playbooks: runner,
    nexus,
    metrics,
    health,
    db,
    secrets,
    scheduler,
    logger,
    disableAll,
    enableAll,
    paranoid: () => (client.security?.paranoidUntil || 0) > Date.now(),
    verifyOnly: () => (client.security?.verifyOnlyUntil || 0) > Date.now(),
    trace: withTrace,
  };

  // ── scheduled jobs ──────────────────────────────────────────────────────
  scheduler.register('grant-sweep', 10 * 60 * 1000, (c) => {
    if (!engine?.sweep) return;
    const revoked = engine.sweep();
    if (revoked?.length) {
      registry.grantSweeps(revoked.length, { reason: 'ttl-or-inactive' });
      for (const row of revoked) {
        try { chain.append(row.guild_id, null, 'capability.revoke', row.principal, { reason: 'ttl-or-inactive', action: row.action }); } catch { /* ignore */ }
      }
    }
  });

  scheduler.register('intel-feeds', 6 * 60 * 60 * 1000, (c) => {
    if (typeof feeds?.syncAll !== 'function') return;
    feeds.syncAll().catch(() => {});
  });
  feeds.syncAll().catch(() => {});

  scheduler.register('merkle-root', 15 * 60 * 1000, (c) => {
    try { if (merkle?.buildDailyRoot) merkle.buildDailyRoot(); } catch { /* ignore */ }
  });
  scheduler.register('nexus-gossip', 5 * 60 * 1000, (c) => {
    if (typeof nexus?.gossip !== 'function') return;
    nexus.gossip().catch(() => {});
  });

  // resume interrupted incidents from a previous crash / restart
  client.once('ready', () => {
    runner.resumeAll(client).then((ids) => {
      if (ids?.length) logger.info({ incidentIds: ids }, 'playbooks:resumed-running');
    }).catch(() => {});
    registry.gatewayPing(Date.now() % 500, { instance: 'peacex' }); // warm
  });

  // localhost observability
  const server = metrics.startServer({ health: () => health.report({ withGateway: true }) });
  client.security._httpServer = server;
  logger.info({ port: process.env.SECURITY_METRICS_PORT || 9090 }, 'observability:listening');

  // alert debouncer loop (reads metric state exposed via registry.<metric>.values)
  scheduler.register('alert-rules', 60_000, (c) => {
    const lat = registry.punishLatency?.values;
    const maxLatency = lat?.size ? Math.max(...[...lat.values()].map((v) => v.sum / Math.max(1, v.count)), 0) : 0;
    const raidG = registry.raidScore?.values;
    const maxRaid = raidG?.size ? Math.max(...[...raidG.values()].map((v) => v.value), 0) : 0;
    return metrics.checkAlerts({ punishmentLatencyMs: maxLatency, raidScore: maxRaid });
  });

  return client.security;
}

/** /safety off: disarm every module without unloading the client. */
function disableAll() {
  const sec = activeClient?.security;
  const list = [
    () => sec.engine.disable(),
    () => anomalies.disable(),
    () => classifier.disable(),
    () => feeds.disable(),
    () => domainRisk.disable(),
    () => ratelimit.disable(),
    () => fingerprint.disable(),
    () => nexus.disable(),
    () => scheduler.disable(),
  ];
  for (const fn of list) { try { fn(); } catch {} }
  if (sec) sec.enabled = false;
}

function enableAll() {
  const sec = activeClient?.security;
  if (!sec) return;
  sec.enabled = true;
  sec.engine.enable();
  scheduler.enable();
}

function shutdown() {
  scheduler.stopAllSchedulers();
  scheduler.unbindClient();
  if (activeClient?.security?._httpServer) activeClient.security._httpServer.close();
  activeClient = null;
}

module.exports = { bootstrap, shutdown, disableAll, enableAll };