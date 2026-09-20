/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — SCHEDULER (shared by every bootstrap interval).
 *
 * All periodic work in the security platform flows through this module so a
 * single failed tick can NEVER crash the process:
 *
 *   - null/undefined active client  → tick skipped (warn)
 *   - fn throws / rejects           → caught, logged with { label, err, stack,
 *                                      durationMs }, never rethrown
 *   - tick still in flight          → next fire is skipped (re-entrancy safe)
 *   - handle.unref()                → process can exit cleanly
 *   - every handle tracked in a Map → stopScheduler / stopAllSchedulers / disable
 *
 * Disarming (/safety off) pauses registration without deleting the handles;
 * shutdown() unregisters them entirely.
 */
const { logger } = require('./log');

const schedulers = new Map(); // label -> { handle, inFlight, fn, everyMs }
let activeClientRef = null;
let paused = false;

function bindClient(client) { activeClientRef = client; }
function unbindClient() { activeClientRef = null; }

function register(label, everyMs, fn) {
  if (schedulers.has(label)) {
    logger.warn({ label }, 'scheduler:duplicate');
    stopScheduler(label);
  }

  const entry = { handle: null, inFlight: false, fn, everyMs };

  const tick = async () => {
    if (paused) {
      logger.warn({ label }, 'scheduler:tick skipped — disarmed');
      return;
    }
    if (entry.inFlight) {
      logger.warn({ label }, 'scheduler:tick skipped — still running');
      return;
    }
    if (!activeClientRef) {
      logger.warn({ label }, 'scheduler:tick skipped — no active client');
      return;
    }
    entry.inFlight = true;
    const t0 = Date.now();
    try {
      await fn(activeClientRef);
      const durationMs = Date.now() - t0;
      if (durationMs > 5000) {
        logger.warn({ label, durationMs }, 'scheduler:tick slow');
      } else {
        logger.debug({ label, durationMs }, 'scheduler:tick ok');
      }
    } catch (err) {
      logger.error(
        { label, err: err?.message || String(err), stack: err?.stack, durationMs: Date.now() - t0 },
        'scheduler:tick failed'
      );
    } finally {
      entry.inFlight = false;
    }
  };

  entry.handle = setInterval(tick, everyMs);
  entry.handle.unref?.();
  schedulers.set(label, entry);
  logger.info({ label, everyMs }, 'scheduler:registered');
  return entry;
}

function stopScheduler(label) {
  const e = schedulers.get(label);
  if (!e) return false;
  clearInterval(e.handle);
  schedulers.delete(label);
  return true;
}

function stopAllSchedulers() {
  for (const [label] of [...schedulers.keys()]) stopScheduler(label);
}

/** /safety off: pause every tick without losing registrations. */
function disable() { paused = true; }

/** /safety on: resume paused ticks. */
function enable() { paused = false; }

function isPaused() { return paused; }

const schedulerApi = {
  bindClient, unbindClient, register,
  stopScheduler, stopAllSchedulers,
  disable, enable, isPaused,
};

module.exports = schedulerApi;