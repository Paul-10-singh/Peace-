/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 9 : STRUCTURED LOGGING (pino) + TRACE IDS.
 *
 * Every request/event in the platform is tagged with a trace id
 * (crypto.randomUUID) that flows through handlers, metrics and the ledger.
 * Uses pino when installed; gracefully falls back to JSON console.
 */
const { randomUUID } = require('crypto');

let pino = null;
try { pino = require('pino'); } catch { pino = null; }

const level = process.env.SECURITY_LOG_LEVEL || 'info';
const logger = pino
  ? pino({ level, base: { service: 'peacex-security', ver: '2.0' }, timestamp: pino.stdTimeFunctions.isoTime })
  : consoleLogger();

function consoleLogger() {
  const noop = () => {};
  const write = (method, obj, msg) => {
    const line = { level: method, ts: new Date().toISOString(), msg, ...(typeof obj === 'string' ? { msg: obj } : { ...obj, msg }) };
    console[method === 'info' ? 'log' : method](JSON.stringify(line));
  };
  return {
    fatal: (o, m) => write('error', o, m),
    error: (o, m) => write('error', o, m),
    warn: (o, m) => write('warn', o, m),
    info: (o, m) => write('info', o, m),
    debug: process.env.SECURITY_LOG_LEVEL === 'debug' ? (o, m) => write('info', o, m) : noop,
    child: () => consoleLogger(),
  };
}

/** Wrap an async handler with trace-id propagation + structured logs. */
function withTrace(scope, handler) {
  return async (...args) => {
    const traceId = randomUUID();
    logger.info({ traceId, scope }, `trace:${scope}:start`);
    const started = Date.now();
    try {
      const out = await handler(...args);
      logger.info({ traceId, scope, ms: Date.now() - started }, `trace:${scope}:ok`);
      return out;
    } catch (err) {
      logger.error({ traceId, scope, ms: Date.now() - started, err: err.message, stack: err.stack }, `trace:${scope}:error`);
      throw err;
    }
  };
}

module.exports = { logger, withTrace, randomUUID };