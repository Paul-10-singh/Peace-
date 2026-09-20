/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 2 : ANOMALY TRIGGER / SOFT-LOCK.
 *
 * Consumes behavior baselines (baseline.js). When a user's z-score crosses
 * 3.5 on any metric they are *soft-locked*: a pending-verification state is
 * opened (persisted in memory + mirrored to the ledger), the member is
 * temporarily time-limited, and admins are pinged. Re-verification happens
 * via /incident verify <userId> or, when enabled, a require-reaction check.
 *
 * Gating mirrors the security platform: disabled guilds and ignored
 * channels never reach here.
 */
const baseline = require('./baseline');
const { sendLog } = require('../../utils/logging');
const { errorEmbed } = require('../../utils/decorations');
const { t } = require('../i18n');

const pendingVerification = new Map(); // `guild:user` -> { at, metric, z }
const SOFT_LOCK_TIMEOUT = 60 * 60 * 1000;

/**
 * Evaluate a member after an activity sample. Returns the anomaly list.
 * Soft-locks on first flagged metric (idempotent per lock window).
 */
async function evaluate(client, member, { now = Date.now() } = {}) {
  if (!member?.guild) return [];
  const { get } = require('../../utils/settings');
  const cfg = get(member.guild.id, 'security');
  if (!cfg.enabled) return [];
  if (cfg.behavior && cfg.behavior.enabled === false) return [];

  const result = baseline.anomalies(member.id, member.guild.id, { now });
  const flagged = result.anomalies.filter((a) => a.anomalous);
  if (!flagged.length) return [];

  const key = `${member.guild.id}:${member.id}`;
  if (pendingVerification.has(key)) return flagged; // already locked

  pendingVerification.set(key, { at: now, metric: flagged[0].metric, z: flagged[0].z, verified: false });

  // soft-lock: timeout (best-effort) so the member cannot keep acting while flagged
  if (member.moderatable && member.id !== member.guild.ownerId) {
    await member.timeout(SOFT_LOCK_TIMEOUT, `Peace✘ UEBA: anomaly score ${flagged[0].z.toFixed(1)} on ${flagged[0].metric}`).catch(() => {});
  }

  const embed = errorEmbed({
    title: 'UEBA Anomaly Detected',
    description: `<@${member.id}> deviates from their behavioral baseline.`,
    fields: flagged.map((a) => ({
      name: a.metric,
      value: `value ${a.value.toFixed(1)} · mean ${a.mean.toFixed(1)} · z **${a.z.toFixed(1)}** (z>3.5 flags)`,
      inline: true,
    })),
    extra: 'Soft-lock applied — re-verify with /incident verify.',
  });
  await sendLog(client, member.guild.id, 'security', { embeds: [embed] });

  try {
    const { append } = require('../ledger/chain');
    append(member.guild.id, member.id, 'ueba.softlock', null, {
      metric: flagged[0].metric, z: flagged[0].z, score: flagged[0].value,
    });
    const { mirror } = require('../ledger/sink');
    await mirror({ day: 0, seq: 0, hash: '', action: 'incident.open' });
  } catch { /* non-fatal */ }

  return flagged;
}

/** Admin verifies a user; clears the soft-lock. */
function verify(memberKey) {
  const entry = pendingVerification.get(memberKey);
  if (!entry) return false;
  entry.verified = true;
  pendingVerification.delete(memberKey);
  return true;
}

function isLocked(guildId, userId) {
  return pendingVerification.has(`${guildId}:${userId}`);
}

function listLocks() {
  return [...pendingVerification.entries()].map(([key, v]) => ({ key, ...v }));
}

function disable() {
  pendingVerification.clear();
}

module.exports = { evaluate, verify, isLocked, listLocks, disable, pendingVerification };