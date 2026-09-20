/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — audit-log executor resolution.
 *
 * Discord provides no push notification for *who* performed an action, so the
 * executor must be resolved from the audit log. This resolver is the single
 * point of attribution: it fetches at most one entry, refuses stale entries
 * (>8s) and returns null on any failure — a null actor never triggers an
 * incident (fail-open for attribution, fail-safe for punishment).
 */
async function getActor(guild, auditType) {
  if (!guild?.fetchAuditLogs) return null;
  try {
    const entry = (await guild.fetchAuditLogs({ type: auditType, limit: 1 })).entries.first();
    if (!entry) return null;
    if (entry.createdTimestamp < Date.now() - 8000) return null;
    return entry.executor || null;
  } catch {
    return null;
  }
}

module.exports = { getActor };