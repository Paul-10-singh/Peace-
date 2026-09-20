/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — GATEWAY (event integration layer).
 *
 * Existing event handlers (antiNuke.js, guildMemberAdd.js, messageCreate.js,
 * profanity.js, roleUpdate.js) migrate to these facades instead of hand-rolled
 * logic. Every path flows through engine.dispatch → ledger append → playbook
 * escalation — the ten-layer platform in one call.
 *
 *    onAuditEvent  — audit-log destructive surface (nuke/massban)
 *    onRoleGrant   — dangerous role-permission grants
 *    onMessage     — content analysis (Layer 3) + spam (Layer 5)
 *    onBotAdd      — unauthorized bot additions
 *    onMemberJoin  — fingerprinting + raid score (Layer 5)
 */
const { get } = require('../utils/settings');
const { errorEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');
const { PermissionsBitField } = require('discord.js');

async function security(client) {
  if (!client.security?.engine) {
    // bootstrap not run (test / degraded boot): construct a minimal no-op
    const { createEngine } = require('./engine');
    client.security = { engine: createEngine({ db: null }) };
    const { bootstrap } = require('./bootstrap');
    bootstrap(client);
  }
  return client.security;
}

function enabled(client, guildId) {
  return get(guildId, 'security')?.enabled !== false && (client.security?.enabled ?? true);
}

// ── audit-surface (nuke / mass-ban) ───────────────────────────────────────
/**
 * Evaluate one destructive action. If the actor is authorized (superuser or
 * capability grant) the action is merely recorded. Otherwise a playbook is
 * opened (instant punishment + lockdown + incident channel).
 */
async function onAuditEvent(client, { guild, capability, label, actor, entityId, metadata = {} }) {
  if (!guild || !enabled(client, guild.id)) return { escalated: false };

  const decision = await client.security.engine.dispatch(capability, {
    client, guild, actor, target: entityId, label, metadata,
  });
  if (decision.ok) return { escalated: false, decision };

  const hang = client.security.playbooks;
  const incident = hang.createIncident({
    guildId: guild.id, type: 'nuke', actor, event: label,
    params: { capability, label, entityId },
  });
  let finalIncident = incident;
  try {
    finalIncident = await hang.run(client, incident, { actor, event: label, guild });
  } catch (err) {
    // playbook can't complete in degraded/tests — still report + leave resumable
    try { client.security.logger?.warn?.({ err: err.message, incident: incident.id }, 'playbook.run:failed'); } catch { /* ignore */ }
  }
  client.security.metrics.registry.threats(1, { action: capability, playbook: 'nuke' });
  await client.security.metrics.checkAlerts({});

  const embed = errorEmbed({
    title: '🚨 ANTI-NUKE',
    description:
      `**${actor?.tag || actor?.id || '?'}** performed an unauthorized action: **${label}**.\n` +
      `Incident **\`${incident.id}\`** — rollback via \`/incident rollback ${incident.id}\`.`,
  });
  await sendLog(client, guild.id, 'security', { embeds: [embed] });
  return { escalated: true, incident: finalIncident, decision };
}

/** Dangerous role-permission grant is a nuke-surface role.grant capability. */
async function onRoleGrant(client, guild, role, beforePerms) {
  const cfg = get(guild.id, 'security');
  if (!cfg.antiNuke?.enabled || !enabled(client, guild.id)) return;
  const { getActor } = require('./auditResolver');
  const actor = await getActor(guild, 'RoleUpdate');
  if (!actor) return;
  return onAuditEvent(client, {
    guild, capability: 'role.grant', label: 'dangerous permissions granted',
    actor, entityId: role.id, metadata: { roleId: role.id },
  });
}

/** Unauthorized bot addition. */
async function onBotAdd(client, member) {
  const cfg = get(member.guild.id, 'security');
  if (!cfg.antiBot?.enabled || !enabled(client, member.guild.id)) return;
  const { getActor } = require('./auditResolver');
  const actor = await getActor(member.guild, 'BotAdd');
  const decision = await client.security.engine.dispatch('bot.add', {
    client, guild: member.guild, actor,
    target: member.id, label: 'unauthorized bot addition',
  });
  if (decision.ok) return { escalated: false };
  await member.kick('Peace✘ anti-nuke: unauthorized bot addition').catch(() => {});
  await onAuditEvent(client, {
    guild: member.guild, capability: 'bot.add', label: 'bot addition',
    actor, entityId: member.id,
  });
  return { escalated: true };
}

// ── message surface (Layer 3 + Layer 5) ───────────────────────────────────
/**
 * Run content analysis + spam limiting for a message. Returns
 * { action: 'safe'|'blocked', reason, verdict }.
 * Fast path (regex/cache/bloom) is awaited; slow AI never hard-blocks unless
 * it resolves within the latency budget.
 */
async function onMessage(client, message) {
  if (!message.guild || message.author?.bot) return { action: 'safe' };
  const cfg = get(message.guild.id, 'security');
  if (!cfg.enabled || !enabled(client, message.guild.id)) return { action: 'safe' };
  if ((cfg.ignoredChannels || []).includes(message.channel.id)) return { action: 'safe' };
  if ((cfg.whitelist || []).includes(message.author.id)) return { action: 'safe' };
  if (message.member?.permissions.has('ManageMessages')) return { action: 'safe' };

  const sec = await security(client);
  const text = message.content || '';

  // 1) spam: distributed sliding-window limit
  if (cfg.antiSpam?.enabled) {
    const limit = cfg.antiSpam.maxMessages || 5;
    const windowMs = cfg.antiSpam.intervalMs || 5000;
    const rl = await sec.ratelimit.redis.slidingWindow(`spam:${message.guild.id}:${message.author.id}`, limit, windowMs);
    if (!rl.allowed) {
      return blockMessage(client, message, cfg, `spamming (${limit} msgs/${windowMs / 1000}s)`);
    }
  }

  // 2) link restriction (legacy allow-list preserved)
  const check = require('../utils/security').checkMessage;
  const legacy = check(message, cfg);
  if (legacy.hit) {
    return blockMessage(client, message, cfg, legacy.reason);
  }

  // 3) Layer 3 content analysis — fast path first
  const knownBad = !!sec.intel.feeds.knownBad && sec.intel.feeds.knownBad(text);
  let analysis;
  try {
    const started = Date.now();
    analysis = await sec.ai.classifier.analyze(text, { guildId: message.guild.id, knownBad });
    sec.metrics.registry.aiLatency(Date.now() - started, { source: analysis.source });
    sec.metrics.registry.aiBusy(1, { source: analysis.source });
  } catch {
    analysis = { verdict: 'safe', confidence: 0, source: 'error' };
  }

  const badVerdicts = ['spam', 'scam', 'phish', 'harass', 'nsfw'];
  if (badVerdicts.includes(analysis.verdict) && analysis.confidence >= 0.6) {
    // mirror to intel sender-reputation + escalation
    if (sec.intel.reputation?.recordSender) sec.intel.reputation.recordSender(text, analysis.verdict, message.guild.id);
    return blockMessage(client, message, cfg, `${analysis.verdict} (${(analysis.confidence * 100).toFixed(0)}%)`);
  }

  // 4) UEBA sample (Layer 2) — soft-lock on sustained anomalies
  if (process.env.SECURITY_ANOMALY === '1' && message.member) {
    sec.behavior.baseline.recordEvent(message.author.id, message.guild.id, 'message', message.channel.id, { len: text.length });
    const flagged = await sec.behavior.anomalies.evaluate(client, message.member);
    if (flagged.length) {
      sec.metrics.registry.threats(1, { action: 'ueba', playbook: 'anomaly' });
      return { action: 'softlocked', reason: 'behavioral-anomaly' };
    }
  }
  return { action: 'safe' };
}

async function blockMessage(client, message, cfg, reason) {
  const { punish } = require('../utils/security');
  await punish(client, message, cfg, reason);
  client.security.metrics.registry.threats(1, { action: 'message', reason });
  return { action: 'blocked', reason };
}

// ── join surface (Layer 5 anti-raid) ──────────────────────────────────────
/**
 * Fingerprint a joining member + evaluate raid score. If the flood window fires
 * or the score crosses the threshold, a raid playbook opens.
 */
async function onMemberJoin(client, member, ctx = {}) {
  const cfg = get(member.guild.id, 'security');
  if (!cfg.antiRaid?.enabled || !enabled(client, member.guild.id)) return { escalated: false };

  const gap = client.security.ratelimit.fingerprint.trackGap(member.guild.id);
  const cls = client.security.ratelimit.fingerprint.classify(member, {
    lastJoinAt: gap, inviteCode: ctx.usedInvite?.code,
  });
  client.security.metrics.registry.raidScore(cls.score, { guild: member.guild.id });

  const flood = await client.security.ratelimit.redis.slidingWindow(
    `raid:${member.guild.id}`, cfg.antiRaid.maxJoins || 8, cfg.antiRaid.windowMs || 10000
  );
  const underRaid = cls.verdict === 'raid' || !flood.allowed;

  if (underRaid) {
    const hang = client.security.playbooks;
    const incident = hang.createIncident({
      guildId: member.guild.id, type: 'raid', actor: member,
      params: { score: cls.score, features: cls.features },
    });
    let finalIncident = incident;
    try {
      finalIncident = await hang.run(client, incident, {
        actor: { id: member.id, tag: member.user?.tag || member.id },
        event: 'raid.score_exceeded', guild: member.guild, raidWindowMs: cfg.antiRaid.windowMs || 10000,
      });
    } catch { /* degraded playbook — incident still resumable */ }
    client.security.metrics.registry.threats(1, { action: 'raid', playbook: 'raid' });
    const { warningEmbed } = require('../utils/decorations');
    const embed = warningEmbed({
      title: '🚨 ANTI-RAID',
      description: `Raid score **${cls.score.toFixed(2)}** — auto-lockdown engaged. Incident \`${incident.id}\`.`,
    });
    await sendLog(client, member.guild.id, 'security', { embeds: [embed] });
    return { escalated: true, incident: finalIncident, score: cls.score };
  }
  return { escalated: false, score: cls.score, debug: cls.debug };
}

function disable() { /* nothing to unwind */ }

module.exports = { onAuditEvent, onRoleGrant, onBotAdd, onMessage, onMemberJoin, enabled, disable };