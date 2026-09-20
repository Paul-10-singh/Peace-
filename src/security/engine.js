/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 1 : ZERO-TRUST CAPABILITY ENGINE.
 *
 * Replaces the static word/role whitelist with a capability-based model.
 * Every protected action (ban, channel.delete, role.grant, guild.update, …)
 * is a *capability*. A user or role is authorized through one of:
 *
 *   1. permanent superuser  — guild owner, the bot itself, main owner +
 *                             extra owners (/owner), members holding the
 *                             guild's crown (Administrator / ManageGuild)
 *   2. a scoped capability grant (SQLite, TTL, HMAC-signed token)
 *   3. legacy whitelist / whitelistRoles (compat; off in strict mode)
 *
 * Grants live in SQLite with a TTL index (expired rows are swept) and their
 * tokens are HMAC-signed so they cannot be forged by tampering with memory.
 *
 * `dispatch(action, ctx)` is THE funnel every security event funnels through:
 * it records the behavior sample (Layer 2), appends to the tamper-evident
 * ledger (Layer 6), resolves authorization, and escalates denials on
 * destructive surfaces to the playbook runner (Layer 7).
 */
const { get } = require('../utils/settings');
const { isOwner } = require('../utils/owners');
const { sha256, hmacSign, signCapabilityToken, verifyCapabilityToken } = require('./crypto');
const { t } = require('./i18n');

// ── Capability catalog ──────────────────────────────────────────────────────
// action -> { label, protected (destructive surface that escalates to a
//             playbook on unauthorized use) }
const CAPABILITIES = {
  ban:              { label: 'ban members',         protected: true },
  kick:             { label: 'kick members',        protected: true },
  timeout:          { label: 'timeout members',     protected: false },
  'channel.create': { label: 'create channels',     protected: true },
  'channel.delete': { label: 'delete channels',     protected: true },
  'channel.update': { label: 'edit channels',       protected: true },
  'role.create':    { label: 'create roles',        protected: true },
  'role.delete':    { label: 'delete roles',        protected: true },
  'role.grant':     { label: 'grant dangerous role perms', protected: true },
  'guild.update':   { label: 'edit server settings', protected: true },
  'webhook.manage': { label: 'manage webhooks',     protected: true },
  'emoji.manage':   { label: 'manage emoji/stickers', protected: true },
  'bot.add':        { label: 'add bots',            protected: true },
  'mention.everyone': { label: '@everyone/@here',   protected: true },
  'security.manage':  { label: 'configure security', protected: false },
};

// Superuser flag: if the member's role set includes any of these, they hold
// the guild's crown and are treated as a permanent superuser (no grant needed).
const CROWN_PERMISSIONS = ['Administrator', 'ManageGuild'];

const LEGACY_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_TTL_MS = 15 * 60 * 1000;                 // 15 minutes

/**
 * Build the engine. `ctx` carries optional dependencies returned by bootstrap:
 *   createEngine({ db }) -> engine
 * Attaches { client.security.engine } via install(client).
 */
function createEngine({ db }) {
  let enabled = true;
  let strictMode = process.env.SECURITY_STRICT === '1';

  // ── persistence helpers ──────────────────────────────────────────────────
  const insertGrant = db.prepare(`
    INSERT INTO capability_grants
      (guild_id, principal, action, scope, token_hash, reason, granted_by, expires_at, last_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  const findGrants = db.prepare(`
    SELECT * FROM capability_grants
    WHERE guild_id = ? AND action = ? AND expires_at > ?
    ORDER BY expires_at DESC
  `);
  const touchGrant = db.prepare(
    'UPDATE capability_grants SET last_used = ? WHERE id = ?'
  );
  const grantById = db.prepare('SELECT * FROM capability_grants WHERE id = ?');
  const deleteGrantById = db.prepare('DELETE FROM capability_grants WHERE id = ?');
  const sweepStale = db.prepare(`
    DELETE FROM capability_grants
    WHERE expires_at <= ? OR (last_used > 0 AND last_used < ?)
    RETURNING id, guild_id, principal, action, reason
  `);

  // ── superuser resolution ──────────────────────────────────────────────────
  /** Discord-level crown: member holds Administrator or ManageGuild. */
  function holdsCrown(guild, member) {
    if (!guild || !member?.roles) return false;
    if (typeof member.permissions?.has === 'function') {
      return CROWN_PERMISSIONS.some((p) => member.permissions.has(p));
    }
    return !!member.roles.cache?.some((r) => CROWN_PERMISSIONS.some((p) => r.permissions?.has?.(p)));
  }

  /**
   * Does this principal bypass the capability check?
   * order: bot self -> owner -> crown -> legacy whitelist (unless strict).
   */
  function isSuperuser(action, guild, memberOrUser) {
    const id = memberOrUser?.id ?? memberOrUser;
    if (!id) return false;

    // the bot itself is the platform, never punishes itself
    if (guild?.client?.user?.id && id === guild.client.user.id) return true;
    if (guild?.members?.me?.id === id) return true;
    if (guild?.id && id === guild.ownerId) return true;
    if (isOwner(id, guild?.id)) return true;

    const member = memberOrUser?.roles ? memberOrUser : guild?.members?.cache?.get(id);
    if (member && holdsCrown(guild, member)) return true;

    if (!strictMode) {
      const cfg = guild?.id ? get(guild.id, 'security') : null;
      if (cfg) {
        if ((cfg.whitelist || []).includes(id)) return true;
        const anti = cfg.antiNuke || {};
        if (member && (anti.whitelistRoles || []).some((rid) => member.roles.cache?.has(rid))) return true;
      }
    }
    return false;
  }

  // ── grant management ──────────────────────────────────────────────────────
  /**
   * Create a scoped grant. Returns { grant, token } or throws on dup-invalid.
   * `principal` is "user:<id>" or "role:<id>". TTL defaults to 15 minutes.
   */
  function grant({ guildId, principal, action, scope = '*', ttlMs = DEFAULT_TTL_MS, reason, grantedBy }) {
    const expiresAt = Date.now() + ttlMs;
    const token = signCapabilityToken({ capability: action, guildId, principal, expiresAt });
    const info = insertGrant.run(
      guildId, principal, action, scope, sha256(token), reason, grantedBy, expiresAt, Date.now()
    );
    return { grant: grantById.get(info.lastInsertRowid), token };
  }

  /** Revoke a single grant by id. */
  function revoke(grantId) {
    const row = grantById.get(grantId);
    if (row) deleteGrantById.run(grantId);
    return row;
  }

  /** Revoke every grant for a principal (used on role change / incident). */
  function revokeForPrincipal(guildId, principal) {
    const rows = db.prepare(
      'SELECT * FROM capability_grants WHERE guild_id = ? AND principal = ?'
    ).all(guildId, principal);
    for (const row of rows) deleteGrantById.run(row.id);
    return rows.length;
  }

  /** List live grants for a guild (optional filter by principal). */
  function listGrants(guildId, principal = null) {
    if (principal) {
      return db.prepare(
        'SELECT * FROM capability_grants WHERE guild_id = ? AND principal = ? ORDER BY expires_at ASC'
      ).all(guildId, principal);
    }
    return db.prepare(
      'SELECT * FROM capability_grants WHERE guild_id = ? ORDER BY expires_at ASC'
    ).all(guildId);
  }

  /** Sweep expired / dormant grants, returning rows removed (caller logs). */
  function sweep() {
    const now = Date.now();
    return sweepStale.all(now, now - LEGACY_INACTIVITY_MS);
  }

  /** Validate an externally-presented HMAC token against an action. */
  function authorizeWithToken(token, action) {
    const fields = verifyCapabilityToken(token);
    if (!fields) return { ok: false, reason: 'invalid-or-expired-token' };
    if (fields.capability !== action) return { ok: false, reason: 'token-capability-mismatch' };
    return { ok: true, basis: 'token', expiresAt: fields.expiresAt };
  }

  // ── the authorization decision ────────────────────────────────────────────
  /**
   * authorize(action, { guild, member })
   * member may be a Member object or { id }. Returns:
   *   { ok, basis, expiresAt?, reason? }
   */
  async function authorize(action, { guild, member }) {
    if (!enabled) return { ok: true, basis: 'disabled' };
    const definition = CAPABILITIES[action];
    if (!definition) return { ok: true, basis: 'unprotected' };

    const id = member?.id ?? member;
    if (isSuperuser(action, guild, member)) return { ok: true, basis: 'superuser' };

    // role grants
    const roleIds = member?.roles?.cache
      ? [...member.roles.cache.keys()]
      : [];
    const principals = new Set([`user:${id}`]);
    for (const rid of roleIds) principals.add(`role:${rid}`);

    for (const principal of principals) {
      // findGrants returns newest-first across ALL principals — pick the
      // newest row that actually belongs to this principal.
      const hit = findGrants.all(guild?.id, action, Date.now()).find((r) => r.principal === principal);
      if (hit) {
        touchGrant.run(Date.now(), hit.id);
        return { ok: true, basis: 'grant', expiresAt: hit.expires_at, principal: hit.principal };
      }
    }

    return { ok: false, basis: 'denied', reason: t('engine.denied', { action, principal: `user:${id}` }) };
  }

  // ── dispatch: the unified security funnel ─────────────────────────────────
  /**
   * dispatch(action, ctx)
   *   ctx = { client, guild, actor, target?, label?, metadata? }
   * Behavior sample (L2) + ledger entry (L6) are recorded; authorization is
   * evaluated; on an unauthorized *protected* action the caller receives
   * decision.ok === false and can escalate (the antiNuke/playbook layer does).
   */
  async function dispatch(action, ctx = {}) {
    const { client, guild, actor, target, label, metadata = {} } = ctx;
    const id = actor?.id ?? actor;

    let decision = { ok: true, basis: 'noop' };
    if (guild?.id) {
      decision = await authorize(action, { guild, member: actor });
    }

    // Layer 6 ledger append (best-effort; never crash the event path).
    const { append } = require('./ledger/chain');
    try {
      append(guild?.id || null, id || null, action, target ? String(target) : null, {
        label: label || CAPABILITIES[action]?.label || action,
        basis: decision.basis,
        ...metadata,
      });
    } catch { /* ledger failures must not break enforcement */ }

    // Layer 2 behavior sample (best-effort).
    const { recordEvent } = require('./behavior/baseline');
    try {
      if (guild?.id && id) {
        recordEvent(id, guild.id, action, target ? String(target) : null, metadata);
      }
    } catch { /* sampling must never throw into the hot path */ }

    return decision;
  }

  /** Middleware wrapper for a slash handler: authorize, else denied embed. */
  function requireCapability(action) {
    return function withCapability(handler) {
      return async function wrapped(interaction, client) {
        if (!interaction.guild) return handler(interaction, client);
        const decision = await authorize(action, { guild: interaction.guild, member: interaction.member });
        if (!decision.ok) {
          const { reply } = require('../utils/helpers');
          const { warningEmbed } = require('../utils/decorations');
          return reply(interaction, {
            embeds: [warningEmbed({ title: t('security.no_permission'), description: decision.reason })],
            ephemeral: true,
          });
        }
        return handler(interaction, client, decision);
      };
    };
  }

  /** Auto-revoke: role membership changed and a role-grant basis vanished. */
  function onRoleChange({ guild, member, beforeRoleIds, afterRoleIds }) {
    const lost = (beforeRoleIds || []).filter((r) => !(afterRoleIds || []).includes(r));
    if (!lost.length) return 0;
    let revoked = 0;
    for (const rid of lost) revoked += revokeForPrincipal(guild?.id, `role:${rid}`);
    return revoked;
  }

  /** install wiring: expose on client.security */
  function install(client) {
    if (!client.security) client.security = {};
    client.security.engine = {
      dispatch,
      authorize: (action, opts) => authorize(action, opts),
      requireCapability,
      grant,
      revoke,
      revokeForPrincipal,
      listGrants,
      sweep,
      onRoleChange,
      authorizeWithToken,
      CAPABILITIES,
      isSuperuser,
    };
    return client.security.engine;
  }

  function disable() { enabled = false; }
  function enable() { enabled = true; }
  function setStrict(v) { strictMode = !!v; }

  return { dispatch, authorize, requireCapability, grant, revoke, revokeForPrincipal, listGrants, sweep, onRoleChange, authorizeWithToken, install, disable, enable, setStrict, CAPABILITIES, isSuperuser };
}

module.exports = { createEngine, CAPABILITIES }; // hmacSign/sha256 re-exported for tests
module.exports.hmacSign = hmacSign;
module.exports.sha256 = sha256;
module.exports.sweepStale = undefined;