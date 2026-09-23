/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 7 : INCIDENT PLAYBOOK RUNNER.
 *
 * Replaces the single monolithic punish() path with resumable, rollback-able
 * playbooks (YAML in src/security/playbooks/). Execution state is persisted
 * per step in SQLite, so if the bot restarts mid-response the runner resumes
 * the incident from the first pending step instead of double-punishing.
 *
 * Every incident stores a rollback snapshot (channel overwrites + actor
 * roles) so /incident rollback <id> can restore the pre-incident state.
 */
const { readFileSync } = require('fs');
const { join } = require('path');
const yaml = require('js-yaml');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField } = require('discord.js');
const { get } = require('../../utils/settings');
const { sendLog } = require('../../utils/logging');
const { errorEmbed, successEmbed, warningEmbed, infoEmbed } = require('../../utils/decorations');
const { cryptoRandomId } = require('./id');

const PLAYBOOK_DIR = join(__dirname);
const cache = new Map();

function loadPlaybook(name) {
  const safe = String(name).replace(/[^a-z0-9-_]/gi, '');
  if (cache.has(safe)) return cache.get(safe);
  let raw;
  try {
    raw = readFileSync(join(PLAYBOOK_DIR, `${safe}.yaml`), 'utf8');
  } catch {
    return null;
  }
  const doc = yaml.load(raw);
  cache.set(safe, doc);
  return doc;
}

function listPlaybooks() {
  return ['nuke', 'raid', 'scam', 'massban'].map((n) => ({ name: n, doc: loadPlaybook(n) }));
}

// ── snapshots (rollback state) ──────────────────────────────────────────────
function snapshotPermissions(guild) {
  const snap = [];
  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased()) continue;
    const overwrite = channel.permissionOverwrites.cache.get(guild.id);
    snap.push({
      guild_id: guild.id,
      channel_id: channel.id,
      overwrite: JSON.stringify(overwrite ? { allow: overwrite.allow?.bitfield || 0, deny: overwrite.deny?.bitfield || 0 } : { allow: 0, deny: 0 }),
      created_at: Date.now(),
    });
  }
  const stmt = claimant.prepare(`
    INSERT OR REPLACE INTO lockdown_snapshots (guild_id, channel_id, overwrite, created_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const row of snap) stmt.run(row.guild_id, row.channel_id, row.overwrite, row.created_at);
  return snap.length;
}

function restorePermissions(guild) {
  const rows = claimant.prepare(
    'SELECT * FROM lockdown_snapshots WHERE guild_id = ?'
  ).all(guild.id);
  let restored = 0;
  for (const row of rows) {
    const channel = guild.channels.cache.get(row.channel_id);
    if (!channel?.isTextBased?.()) continue;
    const ov = safeJson(row.overwrite);
    if (ov.allow || ov.deny) {
      channel.permissionOverwrites.edit(guild.id, { allow: ov.allow, deny: ov.deny }, { reason: 'Peace✘ incident rollback' }).catch(() => {});
    } else {
      channel.permissionOverwrites.delete(guild.id, 'Peace✘ incident rollback').catch(() => {});
    }
    restored += 1;
  }
  return restored;
}

function clearSnapshots(guildId) {
  claimant.prepare('DELETE FROM lockdown_snapshots WHERE guild_id = ?').run(guildId);
}

// ── incident lifecycle ─────────────────────────────────────────────────────
let claimant = { prepare: () => null }; // replaced by bootstrap's init(db)

function init(db) {
  claimant = db;
  return runnerApi;
}

function createIncident({ guildId, type, params = {}, actor = null, event = null }) {
  const id = `${type}-${Date.now().toString(36)}${cryptoRandomId(3)}`;
  const now = Date.now();
  claimant.prepare(`
    INSERT INTO incidents (id, guild_id, type, state, playbook, params, created_at, updated_at, rollback)
    VALUES (?, ?, ?, 'running', ?, ?, ?, ?, '{}')
  `).run(id, guildId, type, type, JSON.stringify(params), now, now);
  const doc = loadPlaybook(type);
  for (let i = 0; i < (doc?.steps?.length || 0); i += 1) {
    claimant.prepare(
      'INSERT OR IGNORE INTO incident_steps (incident_id, step_index, name, status, output, at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, i, doc.steps[i].name, i === 0 ? 'pending' : 'pending', null, null);
  }
  return { id, guildId, type, actor, event, state: 'running' };
}

function getIncident(id) {
  return claimant.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
}

function listIncidents(guildId, limit = 25) {
  return claimant.prepare(
    'SELECT * FROM incidents WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(guildId, limit);
}

function stepStatus(incidentId, index) {
  return claimant.prepare('SELECT * FROM incident_steps WHERE incident_id = ? AND step_index = ?').get(incidentId, index);
}

function markStep(incidentId, index, name, status, output = null) {
  claimant.prepare(
    'UPDATE incident_steps SET status = ?, output = ?, at = ? WHERE incident_id = ? AND step_index = ?'
  ).run(status, output === null ? null : JSON.stringify(output), Date.now(), incidentId, index);
}

function setIncidentState(id, state, rollbackPatch = null) {
  const inc = getIncident(id);
  if (!inc) return;
  const rb = rollbackPatch ? { ...safeJson(inc.rollback), ...rollbackPatch } : safeJson(inc.rollback);
  claimant.prepare(
    'UPDATE incidents SET state = ?, updated_at = ?, rollback = ? WHERE id = ?'
  ).run(state, Date.now(), JSON.stringify(rb), id);
}

// ── step handlers ──────────────────────────────────────────────────────────
const stepHandlers = {
  async snapshot_permissions({ guild }) {
    return { ok: true, output: { channels: snapshotPermissions(guild) } };
  },

  async strip_roles({ client, guild, incident, ctx }) {
    const member = await guild.members.fetch(ctx.actor?.id).catch(() => null);
    const target = ctx.member || member;
    if (!target?.roles?.cache) return { ok: false, output: { reason: 'member-unresolvable' } };
    const managedRoles = target.roles.cache.filter((r) => r.managed).map((r) => r.id);
    const before = target.roles.cache.filter((r) => !r.managed).map((r) => r.id);
    setIncidentState(incident.id, 'running', { actorRoles: before, actorId: target.id });
    if (before.length) await target.roles.set(managedRoles, 'Peace✘ incident: role strip').catch(() => {});
    return { ok: true, output: { removed: before } };
  },

  async punish_actor({ client, guild, incident, ctx }) {
    const cfg = get(guild.id, 'security');
    const punishment = (ctx.punishment || cfg.antiNuke?.punishment || 'ban').toLowerCase();
    const reason = `Peace✘ ${incident.type}: unauthorized ${ctx.event || 'action'}`;
    const member = ctx.member || await guild.members.fetch(ctx.actor?.id).catch(() => null);

    if (ctx.message) {
      // message-surface punish (scam): reuse the warn-ladder path
      const { punish } = require('../../utils/security');
      await punish(client, ctx.message, cfg, ctx.reason || 'scam');
      return { ok: true, output: { mode: 'message-warn' } };
    }
    if (!member) return { ok: false, output: { reason: 'member-unresolvable' } };

    if (punishment === 'kick' && member?.kickable) {
      await member.kick(reason).catch(() => {});
      return { ok: true, output: { punishment: 'kick' } };
    }
    if (punishment === 'timeout' && member?.moderatable) {
      await member.timeout(60 * 60 * 1000, reason).catch(() => {});
      return { ok: true, output: { punishment: 'timeout' } };
    }
    if (guild.members.cache.has(member.id) || guild.members.resolve(member.id)) {
      await guild.members.ban(member.id, { reason, deleteMessageSeconds: 0 }).catch(() => {});
      return { ok: true, output: { punishment: 'ban' } };
    }
    return { ok: false, output: { reason: 'not-bannable' } };
  },

  async lock_channels({ guild }) {
    const cfg = get(guild.id, 'security');
    if (cfg.antiNuke?.lockdown === false) {
      return { ok: true, output: { skipped: true, reason: 'lockdown-disabled-in-config' } };
    }

    let locked = 0;
    for (const channel of guild.channels.cache.values()) {
      if (channel.isTextBased()) {
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }, { reason: 'Peace✘ incident lockdown' }).catch(() => {});
        locked += 1;
      }
    }
    return { ok: true, output: { channels: locked } };
  },

  async freeze_bans({ guild }) {
    // rate-limit the ban route: short-circuit future auto-bans for 60s
    const rl = require('../ratelimit/redis');
    const now = Date.now();
    await rl.slidingWindow(`freeze:${guild.id}:ban`, 0, 60_000, now);
    return { ok: true, output: { frozenMs: 60_000 } };
  },

  async quarantine_joiners({ guild, incident, ctx }) {
    const q = require('../../utils/quarantine');
    const roleId = q.getConfig(guild.id).roleId;
    if (!roleId && !guild.roles.cache.get(roleId)) return { ok: false, output: { reason: 'no-quarantine-role' } };
    const windowTs = Date.now() - (ctx.raidWindowMs || 10 * 60 * 1000);
    let quarantined = 0;
    for (const [mid, m] of guild.members.cache) {
      if (m.user.bot) continue;
      if ((m.joinedTimestamp || 0) < windowTs) continue;
      if (m.id === guild.ownerId) continue;
      await m.roles.add(roleId, 'Peace✘ raid quarantine').catch(() => {});
      quarantined += 1;
    }
    return { ok: true, output: { quarantined } };
  },

  async delete_message({ ctx }) {
    if (!ctx.message) return { ok: false, output: { reason: 'no-message' } };
    await ctx.message.delete().catch(() => {});
    return { ok: true, output: { message_delta: true } };
  },

  async record_offense_hash({ ctx }) {
    const { contentHash } = require('../crypto');
    const { recordSender } = require('../intel/reputation');
    const text = ctx.message?.content || ctx.text || '';
    const hash = contentHash(text);
    if (text) recordSender(hash, ctx.verdict || 'scam', ctx.guild?.id);
    return { ok: true, output: { hash } };
  },

  async notify_admins({ client, guild, incident, ctx }) {
    const adminIds = [];
    for (const m of guild.members.cache.values()) {
      if (m.user.bot) continue;
      if (m.permissions.has(PermissionsBitField.Flags.ManageGuild) || m.id === guild.ownerId) {
        adminIds.push(`<@${m.id}>`);
      }
    }
    const embed = errorEmbed({
      title: `🚨 INCIDENT ${incident.type.toUpperCase()}`,
      description:
        `**Incident ID:** \`${incident.id}\`\n` +
        `**Actor:** ${ctx.actor?.tag || ctx.actor?.id || 'unknown'} (\`${ctx.actor?.id || '?'}\`)\n` +
        `**Event:** ${ctx.event || incident.type}\n` +
        `Rollback available via \`/incident rollback ${incident.id}\`.`,
      extra: `Incident ${incident.id}`,
    });
    const board = guild.systemChannel || guild.channels.cache.find((c) => c.name === 'mod-log' && c.isTextBased());
    if (board?.send) board.send({ content: adminIds.length ? adminIds.slice(0, 60).join(' ') : null, embeds: [embed] }).catch(() => {});
    await sendLog(client, guild.id, 'security', { embeds: [embed] });
    return { ok: true, output: { admins: adminIds.length } };
  },

  async create_incident_channel({ client, guild, incident, ctx }) {
    const name = `incident-${incident.id.split('-').pop()}`;
    const chan = await guild.channels.create({ name, type: 0, reason: 'Peace✘ incident channel' }).catch(() => null);
    if (!chan) return { ok: false, output: { reason: 'channel-create-failed' } };
    await chan.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => {});
    await chan.permissionOverwrites.edit(guild.members.me, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
    setIncidentState(incident.id, 'running', { incidentChannelId: chan.id });
    const rows = claimant.prepare('SELECT * FROM incident_steps WHERE incident_id = ? ORDER BY step_index ASC').all(incident.id);
    const timeline = rows.map((r) => `\`${r.index}\` **${r.name}** — ${r.status}`).join('\n');
    const undoRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`incident:undo:${incident.id}`).setLabel('Undo (rollback)').setStyle(ButtonStyle.Danger)
    );
    await chan.send({
      embeds: [infoEmbed({ title: `Incident ${incident.id}`, description: `**Type:** ${incident.type}\n**Actor:** ${ctx.actor?.tag || '?'}\n\n${timeline}` })],
      components: [undoRow],
    }).catch(() => {});
    return { ok: true, output: { channelId: chan.id } };
  },

  async enable_paranoid_mode({ client, guild, incident }) {
    if (!client.security) client.security = {};
    client.security.paranoidUntil = Date.now() + 30 * 60 * 1000;
    return { ok: true, output: { paranoidMs: 30 * 60 * 1000 } };
  },

  async enable_verification({ guild }) {
    const pr = require('../ratelimit/fingerprint');
    // mark verification mode in-memory; message gating reads it
    if (!guild.client.security) guild.client.security = {};
    guild.client.security.verifyOnlyUntil = Date.now() + 15 * 60 * 1000;
    return { ok: true, output: { verifyOnlyMs: 15 * 60 * 1000 } };
  },

  async warn_user({ client, guild, incident, ctx }) {
    const member = ctx.member || ctx.actor;
    if (!member?.send) return { ok: false, output: { reason: 'no-dm' } };
    await member.send(`You were **punished** in **${guild.name}**. Incident: \`${incident.id}\` (${incident.type}).`).catch(() => {});
    return { ok: true, output: { dm: true } };
  },
};

// ── execution ──────────────────────────────────────────────────────────────
function resolveParams(doc, overrides = {}) {
  const out = {};
  for (const step of doc?.steps || []) {
    const p = step.params || {};
    for (const [k, v] of Object.entries(p)) out[k] = typeof v === 'string' && v.startsWith('#') ? overrides[v.slice(1)] : v;
  }
  return out;
}

/**
 * Execute a playbook as an async generator over steps. Yields
 * { step, index, name, status, output } per step. Idempotent for resume:
 * steps already 'done' are skipped.
 */
async function* execute(client, incident, ctx = {}) {
  const doc = loadPlaybook(incident.type);
  if (!doc) { yield { status: 'failed', error: 'playbook-not-found' }; return; }
  const overrides = resolveParams(doc, { punishment: get(incident.guildId, 'security')?.antiNuke?.punishment || 'ban' });

  for (let i = 0; i < (doc.steps || []).length; i += 1) {
    const stepDef = doc.steps[i];
    const prior = stepStatus(incident.id, i);
    if (prior?.status === 'done') {
      yield { step: stepDef, index: i, status: 'skipped', output: safeJson(prior.output) };
      continue;
    }
    const handler = stepHandlers[stepDef.name];
    if (!handler) {
      markStep(incident.id, i, stepDef.name, 'failed', { reason: 'no-handler' });
      yield { step: stepDef, index: i, status: 'failed', error: 'no-handler' };
      continue;
    }
    let result;
    try {
      result = await handler({ client, guild: client?.guilds?.cache?.get(incident.guildId) || ctx.guild, incident, ctx: { ...ctx, ...overrides } });
    } catch (err) {
      markStep(incident.id, i, stepDef.name, 'failed', { error: err.message });
      yield { step: stepDef, index: i, status: 'failed', error: err.message };
      continue;
    }
    markStep(incident.id, i, stepDef.name, result?.ok === false ? 'failed' : 'done', result?.output || null);
    yield { step: stepDef, index: i, status: result?.ok === false ? 'failed' : 'done', output: result?.output || null };
  }
}

/** Run (or resume from) an incident. */
async function run(client, incident, ctx = {}) {
  for await (const _step of execute(client, incident, ctx)) { /* drive */ }
  const failed = claimant.prepare(
    "SELECT COUNT(*) AS c FROM incident_steps WHERE incident_id = ? AND status = 'failed'"
  ).get(incident.id).c;
  setIncidentState(incident.id, failed ? 'failed' : 'done');
  return getIncident(incident.id);
}

/** Resume every 'running' incident after a restart (skip completed steps). */
async function resumeAll(client) {
  const running = claimant.prepare("SELECT * FROM incidents WHERE state = 'running'").all();
  const results = [];
  for (const inc of running) {
    await run(client, inc);
    results.push(inc.id);
  }
  return results;
}

// ── rollback ───────────────────────────────────────────────────────────────
async function rollback(client, incidentId) {
  const inc = getIncident(incidentId);
  if (!inc) return { ok: false, reason: 'not-found' };
  const guild = client?.guilds?.cache?.get(inc.guildId);
  if (!guild) return { ok: false, reason: 'guild-unavailable' };

  const rb = safeJson(inc.rollback);
  const restored = [];

  if (rb.incidentChannelId) {
    const chan = guild.channels.cache.get(rb.incidentChannelId);
    if (chan) { await chan.delete('Peace✘ incident rollback').catch(() => {}); restored.push('incident channel deleted'); }
  }

  const channels = restorePermissions(guild);
  restored.push(`${channels} channel overwrites restored`);

  if (rb.actorId && Array.isArray(rb.actorRoles)) {
    const member = await guild.members.fetch(rb.actorId).catch(() => null);
    if (member) {
      const managed = member.roles.cache.filter((r) => r.managed).map((r) => r.id);
      await member.roles.set([...managed, ...rb.actorRoles], 'Peace✘ incident rollback').catch(() => {});
      restored.push('actor roles restored');
    }
  }

  clearSnapshots(inc.guildId);
  setIncidentState(incidentId, 'rolled_back');
  return { ok: true, restored, incident: getIncident(incidentId) };
}

/** Button handler: incident:undo:<id> */
async function handleButton(interaction, client) {
  const match = /^incident:undo:(.+)$/.exec(interaction.customId);
  if (!match) return;
  const res = await rollback(client, match[1]);
  await interaction.reply({
    embeds: [res.ok ? successEmbed({ description: `Rolled back: ${res.restored?.join(' · ')}` }) : warningEmbed({ description: res.reason })],
    flags: 64,
  }).catch(() => {});
}

function safeJson(raw) {
  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}

const runnerApi = { init, loadPlaybook, listPlaybooks, createIncident, getIncident, listIncidents, run, resumeAll, rollback, handleButton, execute, markStep };

module.exports = runnerApi;