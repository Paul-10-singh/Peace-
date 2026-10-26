import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isOwner, isBotOwner, BOT_OWNER_COMMANDS } from '../src/utils/owners';
import { hasAccess } from '../src/utils/permissions';

describe('Multi-Tier Owner & Permission System', () => {
  const BOT_OWNER_ID = '999000111222333444';
  const SERVER_A_OWNER_ID = '111222333444555666';
  const SERVER_C_OWNER_ID = '777888999000111222';
  const RANDOM_USER_ID = '555666777888999000';

  const GUILD_A = {
    id: '100000000000000001',
    ownerId: SERVER_A_OWNER_ID,
  };

  const GUILD_C = {
    id: '100000000000000002',
    ownerId: SERVER_C_OWNER_ID,
  };

  let originalOwnerId;

  beforeEach(() => {
    originalOwnerId = process.env.OWNER_ID;
    process.env.OWNER_ID = BOT_OWNER_ID;
  });

  afterEach(() => {
    process.env.OWNER_ID = originalOwnerId;
  });

  it('correctly identifies Global Bot Owner vs Guild Owners', () => {
    expect(isBotOwner(BOT_OWNER_ID)).toBe(true);
    expect(isBotOwner(SERVER_A_OWNER_ID)).toBe(false);
    expect(isBotOwner(SERVER_C_OWNER_ID)).toBe(false);
    expect(isBotOwner(RANDOM_USER_ID)).toBe(false);
  });

  it('grants Global Bot Owner owner-access across all servers and globally', () => {
    expect(isOwner(BOT_OWNER_ID, GUILD_A.id, GUILD_A)).toBe(true);
    expect(isOwner(BOT_OWNER_ID, GUILD_C.id, GUILD_C)).toBe(true);
    expect(isOwner(BOT_OWNER_ID, null, null)).toBe(true);
  });

  it('grants Server A Owner owner-access ONLY in Server A', () => {
    expect(isOwner(SERVER_A_OWNER_ID, GUILD_A.id, GUILD_A)).toBe(true);
    expect(isOwner(SERVER_A_OWNER_ID, GUILD_C.id, GUILD_C)).toBe(false);
    expect(isOwner(SERVER_A_OWNER_ID, null, null)).toBe(false);
  });

  it('grants Server C Owner owner-access ONLY in Server C', () => {
    expect(isOwner(SERVER_C_OWNER_ID, GUILD_C.id, GUILD_C)).toBe(true);
    expect(isOwner(SERVER_C_OWNER_ID, GUILD_A.id, GUILD_A)).toBe(false);
    expect(isOwner(SERVER_C_OWNER_ID, null, null)).toBe(false);
  });

  it('restricts BOT_OWNER_COMMANDS exclusively to the Global Bot Owner', () => {
    const sensitive = ['serverlist', 'leaveserver', 'setprofile', 'backup', 'clone', 'mention', 'noprefix', 'refresh', 'extraowner'];

    for (const cmd of sensitive) {
      expect(BOT_OWNER_COMMANDS.has(cmd)).toBe(true);

      // Bot Owner allowed
      expect(hasAccess({ id: BOT_OWNER_ID }, GUILD_A, cmd)).toBe(true);
      expect(hasAccess({ id: BOT_OWNER_ID }, GUILD_C, cmd)).toBe(true);

      // Server Owners denied
      expect(hasAccess({ id: SERVER_A_OWNER_ID }, GUILD_A, cmd)).toBe(false);
      expect(hasAccess({ id: SERVER_A_OWNER_ID }, GUILD_C, cmd)).toBe(false);
      expect(hasAccess({ id: SERVER_C_OWNER_ID }, GUILD_C, cmd)).toBe(false);
    }
  });

  it('allows Server Owners to run server management commands only in their own server', () => {
    // Quarantine is an OWNER tier command
    expect(hasAccess({ id: SERVER_A_OWNER_ID }, GUILD_A, 'quarantine')).toBe(true);
    expect(hasAccess({ id: SERVER_A_OWNER_ID }, GUILD_C, 'quarantine')).toBe(false);

    expect(hasAccess({ id: SERVER_C_OWNER_ID }, GUILD_C, 'quarantine')).toBe(true);
    expect(hasAccess({ id: SERVER_C_OWNER_ID }, GUILD_A, 'quarantine')).toBe(false);
  });

  it('allows public commands for any member', () => {
    expect(hasAccess({ id: SERVER_A_OWNER_ID }, GUILD_C, 'help')).toBe(true);
    expect(hasAccess({ id: RANDOM_USER_ID }, GUILD_A, 'help')).toBe(true);
  });
});
