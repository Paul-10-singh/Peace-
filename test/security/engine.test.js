import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Native CommonJS require keeps ONE module instance shared with everything the
// engine pulls in via its own require() — vitest ESM-import would create a
// second copy with a separate module-level DB/settings cache.
const require = createRequire(import.meta.url);

const { openDatabase } = require('../../src/security/db.js');
const { createEngine } = require('../../src/security/engine.js');
const chain = require('../../src/security/ledger/chain.js');
const settings = require('../../src/utils/settings.js');

let db;
let engine;

const guild = { id: 'G', ownerId: 'OWNER', client: { user: { id: 'BOT' } }, members: { cache: new Map() } };
const user = { id: 'USER1' };

/** Mini discord Collection: a Map that also exposes Collection#some. */
function roleCache(ids) {
  const map = new Map(ids.map((id) => [id, { id }]));
  map.some = (fn) => [...map.values()].some(fn);
  return map;
}

beforeEach(() => {
  // deterministic guild context; settings are global & persistent (real file),
  // so reset the whitelist every test
  settings.set('G', 'security', {
    enabled: false, autoWarn: true, action: 'warn', warnThreshold: 3, whitelist: [], warns: {},
    antiSpam: { enabled: false, maxMessages: 5, intervalMs: 5000 },
    antiLink: { enabled: false, allow: [], blockScam: true },
    antiNuke: { enabled: false, punishment: 'ban', extraOwners: [], whitelistRoles: [], lockdown: true },
    words: [],
  });
  db = openDatabase(':memory:');
  chain.init(db);
  engine = createEngine({ db });
});

describe('engine.grant', () => {
  it('issues a signed, persisted grant', () => {
    const { grant, token } = engine.grant({ guildId: 'G', principal: 'user:USER1', action: 'ban', ttlMs: 60_000, grantedBy: 'test' });
    expect(token).toMatch(/^shax2\.ban\.G\./);
    expect(grant.action).toBe('ban');
    expect(engine.listGrants('G')).toHaveLength(1);
    expect(engine.listGrants('G', 'user:USER1')).toHaveLength(1);
  });

  it('revokes by id and by principal', () => {
    const { grant } = engine.grant({ guildId: 'G', principal: 'role:R', action: 'kick' });
    expect(engine.revoke(grant.id)).toBeDefined();
    engine.grant({ guildId: 'G', principal: 'role:R', action: 'kick' });
    expect(engine.revokeForPrincipal('G', 'role:R')).toBe(1);
    expect(engine.listGrants('G')).toHaveLength(0);
  });

  it('sweeps expired and dormant grants', () => {
    engine.grant({ guildId: 'G', principal: 'user:A', action: 'ban', ttlMs: -1000 });
    engine.grant({ guildId: 'G', principal: 'user:B', action: 'kick', ttlMs: 60_000 });
    const purged = engine.sweep();
    expect(purged.some((r) => r.principal === 'user:A')).toBe(true);
    expect(engine.listGrants('G').some((r) => r.principal === 'user:B')).toBe(true);
  });
});

describe('engine.authorize', () => {
  it('treats the guild owner as a permanent superuser', async () => {
    const { ok, basis } = await engine.authorize('ban', { guild, member: { id: 'OWNER' } });
    expect(ok).toBe(true);
    expect(basis).toBe('superuser');
  });

  it('treats role grants as a capability basis', async () => {
    engine.grant({ guildId: 'G', principal: 'role:ADMIN', action: 'ban' });
    const member = { id: 'USER2', roles: { cache: roleCache(['ADMIN']) } };
    const { ok, basis, principal } = await engine.authorize('ban', { guild, member });
    expect(ok).toBe(true);
    expect(basis).toBe('grant');
    expect(principal).toBe('role:ADMIN');
  });

  it('touches last_used on a successful grant hit', async () => {
    const { grant } = engine.grant({ guildId: 'G', principal: 'role:ADMIN', action: 'ban' });
    const member = { id: 'USER2', roles: { cache: roleCache(['ADMIN']) } };
    await engine.authorize('ban', { guild, member });
    expect(db.prepare('SELECT last_used FROM capability_grants WHERE id=?').get(grant.id).last_used).toBeGreaterThan(0);
  });

  it('denies unknown users on protected surfaces', async () => {
    const { ok, basis } = await engine.authorize('ban', { guild, member: user });
    expect(ok).toBe(false);
    expect(basis).toBe('denied');
  });

  it('allows actions that are not in the capability catalog', async () => {
    const { ok, basis } = await engine.authorize('read.something', { guild, member: user });
    expect(ok).toBe(true);
    expect(basis).toBe('unprotected');
  });

  it('returns ok with basis disabled when disabled', async () => {
    engine.disable();
    const { ok, basis } = await engine.authorize('ban', { guild, member: user });
    expect(ok).toBe(true);
    expect(basis).toBe('disabled');
    engine.enable();
    expect((await engine.authorize('ban', { guild, member: user })).ok).toBe(false);
  });

  it('honours legacy whitelist when not in strict mode', async () => {
    delete process.env.SECURITY_STRICT;
    settings.set('G', 'security', { ...settings.get('G', 'security'), whitelist: ['USER1'] });
    const { ok, basis } = await engine.authorize('ban', { guild, member: user });
    expect(ok).toBe(true);
    expect(basis).toBe('superuser');
  });

  it('ignores the legacy whitelist in strict mode', async () => {
    delete process.env.SECURITY_STRICT;
    settings.set('G', 'security', { ...settings.get('G', 'security'), whitelist: ['USER1'] });
    engine.setStrict(true);
    const { ok, basis } = await engine.authorize('ban', { guild, member: user });
    expect(ok).toBe(false);
    expect(basis).toBe('denied');
  });

  it('honours the crown (Administrator/ManageGuild)', async () => {
    const admin = { id: 'ADMIN', roles: {}, permissions: { has: (p) => p === 'Administrator' } };
    const { ok, basis } = await engine.authorize('role.grant', { guild, member: admin });
    expect(ok).toBe(true);
    expect(basis).toBe('superuser');
  });
});

describe('engine.dispatch', () => {
  it('funnels through authorize and returns the decision', async () => {
    const denied = await engine.dispatch('ban', { guild, actor: user });
    expect(denied.ok).toBe(false);
    expect(denied.basis).toBe('denied');

    const ownerDecision = await engine.dispatch('ban', { guild, actor: { id: 'OWNER' } });
    expect(ownerDecision.ok).toBe(true);
    expect(ownerDecision.basis).toBe('superuser');

    const granted = await engine.dispatch('kick', { guild, actor: user, target: 'U3' });
    expect(granted.ok).toBe(false);
  });

  it('handles missing guild and actor gracefully', async () => {
    const d = await engine.dispatch('ban', {});
    expect(d.ok).toBe(true);
  });
});

describe('engine onboarding', () => {
  it('installs onto client.security', () => {
    const client = {};
    engine.install(client);
    expect(client.security.engine.grant).toBeTypeOf('function');
    expect(client.security.engine.CAPABILITIES.ban).toBeDefined();
  });

  it('authorizeWithToken accepts a fresh token and rejects mismatches', () => {
    const { token } = engine.grant({ guildId: 'G', principal: 'user:USER1', action: 'ban' });
    expect(engine.authorizeWithToken(token, 'ban').ok).toBe(true);
    expect(engine.authorizeWithToken(token, 'kick').ok).toBe(false);
    expect(engine.authorizeWithToken('cap.fake.zzz', 'ban').ok).toBe(false);
  });

  it('onRoleChange revokes grants bound to a lost role', () => {
    engine.grant({ guildId: 'G', principal: 'role:R1', action: 'ban' });
    engine.grant({ guildId: 'G', principal: 'role:R2', action: 'kick' });
    const revoked = engine.onRoleChange({ guild, member: user, beforeRoleIds: ['R1', 'R2'], afterRoleIds: ['R2'] });
    expect(revoked).toBe(1);
    expect(engine.listGrants('G', 'role:R1')).toHaveLength(0);
  });

  it('isSuperuser recognizes the bot itself', () => {
    expect(engine.isSuperuser('ban', guild, { id: 'BOT' })).toBe(true);
  });
});