/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — public facade. External modules import this single entrypoint
 * (`require('../security')`) instead of reaching into layer internals.
 */
const { bootstrap, shutdown } = require('./bootstrap');
const engine = require('./engine');
const baseline = require('./behavior/baseline');
const anomalies = require('./behavior/anomalies');
const chain = require('./ledger/chain');
const merkle = require('./ledger/merkle');
const sink = require('./ledger/sink');
const runner = require('./playbooks/runner');
const classifier = require('./ai/classifier');
const verdictCache = require('./ai/cache');
const feeds = require('./intel/feeds');
const bloom = require('./intel/bloom');
const intelRep = require('./intel/reputation');
const domainRisk = require('./intel/domainRisk');
const ratelimit = require('./ratelimit/redis');
const fingerprint = require('./ratelimit/fingerprint');
const nexus = require('./nexus/gossip');
const nexusRep = require('./nexus/reputation');
const metrics = require('./observability/metrics');
const health = require('./observability/health');
const { logger, withTrace } = require('./log');
const { openDatabase } = require('./db');

module.exports = {
  bootstrap,
  shutdown,
  openDatabase,
  engine,
  baseline,
  anomalies,
  chain,
  merkle,
  sink,
  runner,
  classifier,
  verdictCache,
  feeds,
  bloom,
  intelRep,
  domainRisk,
  ratelimit,
  fingerprint,
  nexus,
  nexusRep,
  metrics,
  health,
  logger,
  withTrace,
};