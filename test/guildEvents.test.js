import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const {
  AuditLogEvent,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const {
  EMOJI_SQ,
  buildWelcomeContainer,
  buildDepartureContainer,
  buildOwnerJoinTelemetryContainer,
  collectGuildJoinTelemetry,
  events,
} = require('../src/events/guildEvents');

describe('guildEvents (Welcome, Departure & Bot Owner Join Telemetry Components V2)', () => {
  let prevOwnerId;
  let prevOwnerIds;

  beforeEach(() => {
    vi.restoreAllMocks();
    prevOwnerId = process.env.OWNER_ID;
    prevOwnerIds = process.env.OWNER_IDS;
    delete process.env.OWNER_ID;
    delete process.env.OWNER_IDS;
  });

  afterEach(() => {
    if (prevOwnerId !== undefined) process.env.OWNER_ID = prevOwnerId;
    else delete process.env.OWNER_ID;
    if (prevOwnerIds !== undefined) process.env.OWNER_IDS = prevOwnerIds;
    else delete process.env.OWNER_IDS;
  });

  const makeMockClient = () => ({
    user: {
      id: '999888777666555444',
      username: 'Peace✘',
      displayAvatarURL: vi.fn(() => 'https://cdn.discordapp.com/avatars/999/bot.png'),
    },
    users: {
      fetch: vi.fn(),
    },
  });

  it('builds a valid welcome container with the <a:sq:1552095567759417477> emoji and thumbnail', () => {
    const client = makeMockClient();
    const owner = { id: '111', username: 'smith.code', globalName: 'TNC ⚡ ACE' };
    const guild = {
      id: '222',
      name: "smith.code's server",
      iconURL: vi.fn(() => 'https://cdn.discordapp.com/icons/222/guild.png'),
    };

    const container = buildWelcomeContainer({ client, guild, owner });
    const json = container.toJSON();

    expect(json.type).toBe(17); // Container
    const serialized = JSON.stringify(json);
    expect(serialized).toContain(EMOJI_SQ);
    expect(serialized).toContain('Hey TNC ⚡ ACE , I am Peace✘!');
    expect(serialized).toContain("Thanks for adding me to smith.code's server!");
    expect(serialized).toContain('Type `/help` to dive in.');
    expect(serialized).toContain('Invite Bot');
    expect(serialized).toContain('Support Server');
    expect(serialized).toContain('https://cdn.discordapp.com/icons/222/guild.png');
  });

  it('falls back to bot avatar when guild has no icon', () => {
    const client = makeMockClient();
    const owner = { id: '111', username: 'smith.code' };
    const guild = {
      id: '222',
      name: 'No Icon Server',
      iconURL: vi.fn(() => null),
    };

    const json = buildWelcomeContainer({ client, guild, owner }).toJSON();
    const serialized = JSON.stringify(json);
    expect(serialized).toContain('https://cdn.discordapp.com/avatars/999/bot.png');
    expect(serialized).toContain('Hey smith.code , I am Peace✘!');
  });

  it('builds a valid departure container with <a:sq:1552095567759417477> and buttons', () => {
    const client = makeMockClient();
    const guild = { id: '222', name: 'Test Server' };

    const json = buildDepartureContainer({ client, guild, reason: 'Manual kick' }).toJSON();
    expect(json.type).toBe(17);
    const serialized = JSON.stringify(json);
    expect(serialized).toContain(EMOJI_SQ);
    expect(serialized).toContain('Peace✘ — Departure Notice');
    expect(serialized).toContain('Test Server');
    expect(serialized).toContain('Manual kick');
    expect(serialized).toContain('Support Server');
    expect(serialized).toContain('Add Me Back');
  });

  it('builds Bot Owner Join Telemetry container with Identification, Census, Invite & Link Button', () => {
    const client = makeMockClient();
    const owner = { id: '1202689641757806602', username: 'smith.code' };
    const addedBy = { id: '1202689641757806602', username: 'smith.code' };
    const guild = {
      id: '1340411772619980953',
      name: "smith.code's server",
      ownerId: owner.id,
      premiumTier: 2,
      iconURL: vi.fn(() => 'https://cdn.discordapp.com/icons/134/icon.png'),
    };

    const json = buildOwnerJoinTelemetryContainer({
      client,
      guild,
      owner,
      addedBy,
      census: { total: 9, humans: 2, bots: 7, botPct: '77.8' },
      hasAdmin: true,
      channelsCount: 12,
      rolesCount: 5,
      permanentInvite: 'https://discord.gg/fYnDJze8n8',
      joinedTimestamp: 1794380000,
    }).toJSON();

    expect(json.type).toBe(17);
    const serialized = JSON.stringify(json);
    expect(serialized).toContain('Server Join Telemetry Log');
    expect(serialized).toContain('Server Identification');
    expect(serialized).toContain('1340411772619980953');
    expect(serialized).toContain('<@1202689641757806602> (`1202689641757806602`)');
    expect(serialized).toContain('Census & Telemetry');
    expect(serialized).toContain('Total Members: `9`');
    expect(serialized).toContain('`2` Humans • `7` Bots (`77.8%` Bots)');
    expect(serialized).toContain('High Bot Ratio (77.8%)');
    expect(serialized).toContain('Join Details & Access');
    expect(serialized).toContain('[Click to Join](https://discord.gg/fYnDJze8n8)');
    expect(serialized).toContain('<t:1794380000:F> (<t:1794380000:R>)');
    expect(serialized).toContain('Server Invite Link');
    expect(serialized).toContain('Peace✘ — Server Telemetry Protocol');
    // Uses clean gap separators rather than divider rules
    const seps = json.components.filter((c) => c.type === 14);
    expect(seps.length).toBeGreaterThan(0);
    expect(seps.every((s) => s.divider === false)).toBe(true);
  });

  it('handles blank server names and missing invite URL cleanly in telemetry card', () => {
    const client = makeMockClient();
    const json = buildOwnerJoinTelemetryContainer({
      client,
      guild: { id: '333', name: '   ', iconURL: () => null },
      census: { total: 5, humans: 5, bots: 0, botPct: '0.0' },
      permanentInvite: null,
      addedByFallback: 'No Audit Log Perm',
    }).toJSON();

    const serialized = JSON.stringify(json);
    expect(serialized).toContain('Unnamed Server');
    expect(serialized).toContain('No Audit Log Perm');
    expect(serialized).toContain('Unavailable (Missing Invite Permission)');
    expect(serialized).not.toContain('Server Invite Link');
  });

  it('guildCreate sends Components V2 DM to owner and posts to system channel', async () => {
    const ownerSend = vi.fn(async () => {});
    const channelSend = vi.fn(async () => {});
    const owner = { id: '111', username: 'smith.code', globalName: 'TNC ⚡ ACE', send: ownerSend };

    const client = makeMockClient();
    client.users.fetch.mockResolvedValue(owner);

    const me = { id: '999888777666555444' };
    const sysChannel = {
      isTextBased: () => true,
      isVoiceBased: () => false,
      permissionsFor: () => ({
        has: (perms) =>
          Array.isArray(perms)
            ? perms.includes(PermissionFlagsBits.ViewChannel) && perms.includes(PermissionFlagsBits.SendMessages)
            : true,
      }),
      send: channelSend,
    };

    const fullGuild = {
      id: '222',
      name: 'My Server',
      ownerId: '111',
      iconURL: () => null,
      members: { me, fetchMe: vi.fn(async () => me) },
      systemChannel: sysChannel,
      channels: { cache: { filter: () => ({ first: () => null }) } },
    };

    const guild = {
      ...fullGuild,
      fetch: vi.fn(async () => fullGuild),
    };

    await events.guildCreate(client, guild);

    expect(ownerSend).toHaveBeenCalledTimes(1);
    const dmPayload = ownerSend.mock.calls[0][0];
    expect(dmPayload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(dmPayload.components).toHaveLength(1);
    expect(dmPayload.embeds).toBeUndefined();

    expect(channelSend).toHaveBeenCalledTimes(1);
    expect(channelSend.mock.calls[0][0].flags).toBe(MessageFlags.IsComponentsV2);
  });

  it('guildCreate sends rich Telemetry DM to Bot Owner with census, audit log adder, and permanent invite', async () => {
    const botOwnerId = '1202689641757806602';
    process.env.OWNER_ID = botOwnerId;

    const serverOwnerSend = vi.fn(async () => {});
    const botOwnerSend = vi.fn(async () => {});
    const channelSend = vi.fn(async () => {});

    const serverOwner = { id: '555', username: 'serverowner', send: serverOwnerSend };
    const botOwner = { id: botOwnerId, username: 'smith.code', send: botOwnerSend };
    const adder = { id: '777', username: 'inviter' };

    const client = makeMockClient();
    client.users.fetch.mockImplementation(async (uid) => {
      if (uid === '555') return serverOwner;
      if (uid === botOwnerId) return botOwner;
      return null;
    });

    const memberCache = new Map([
      ['u1', { user: { id: 'u1', bot: false } }],
      ['u2', { user: { id: 'u2', bot: false } }],
      ['b1', { user: { id: 'b1', bot: true } }],
      ['b2', { user: { id: 'b2', bot: true } }],
      ['b3', { user: { id: 'b3', bot: true } }],
    ]);

    const me = {
      id: client.user.id,
      permissions: {
        has: () => true,
      },
    };

    const createInvite = vi.fn(async () => ({ url: 'https://discord.gg/permInvite123' }));
    const sysChannel = {
      isTextBased: () => true,
      isVoiceBased: () => false,
      permissionsFor: () => ({ has: () => true }),
      send: channelSend,
      createInvite,
    };

    const fullGuild = {
      id: '888999000',
      name: 'New Community',
      ownerId: '555',
      memberCount: 5,
      premiumTier: 1,
      iconURL: () => 'https://cdn.discordapp.com/icons/888/img.png',
      roles: { cache: new Map([['r1', {}], ['r2', {}]]) },
      channels: {
        cache: new Map([['ch1', sysChannel]]),
        filter: () => ({ first: () => sysChannel }),
      },
      invites: {
        fetch: vi.fn(async () => new Map()),
      },
      fetchAuditLogs: vi.fn(async ({ type }) => {
        expect(type).toBe(AuditLogEvent.BotAdd);
        return {
          entries: new Map([
            ['a1', { targetId: client.user.id, executor: adder, createdTimestamp: Date.now() }],
          ]),
        };
      }),
      members: {
        me,
        cache: memberCache,
        fetch: vi.fn(async () => memberCache),
        fetchMe: vi.fn(async () => me),
      },
      systemChannel: sysChannel,
    };

    const telemetry = await collectGuildJoinTelemetry({ client, guild: fullGuild, owner: serverOwner });
    expect(telemetry.addedBy.id).toBe('777');
    expect(telemetry.census).toEqual({ total: 5, humans: 2, bots: 3, botPct: '60.0' });
    expect(telemetry.permanentInvite).toBe('https://discord.gg/permInvite123');

    await events.guildCreate(client, { ...fullGuild, fetch: vi.fn(async () => fullGuild) });

    expect(createInvite).toHaveBeenCalledWith(
      expect.objectContaining({ maxAge: 0, maxUses: 0, unique: false }),
    );
    expect(createInvite.mock.calls[0][0].reason).toBeUndefined();
    expect(serverOwnerSend).toHaveBeenCalledTimes(1);
    expect(botOwnerSend).toHaveBeenCalledTimes(1);

    // Ensure telemetry is NEVER exposed to server owner or server channel
    const serverOwnerStr = JSON.stringify(serverOwnerSend.mock.calls[0][0].components[0].toJSON());
    expect(serverOwnerStr).not.toContain('Telemetry');
    expect(serverOwnerStr).not.toContain('Census');
    expect(serverOwnerStr).not.toContain('Permanent Invite');

    const channelStr = JSON.stringify(channelSend.mock.calls[0][0].components[0].toJSON());
    expect(channelStr).not.toContain('Telemetry');
    expect(channelStr).not.toContain('Census');
    expect(channelStr).not.toContain('Permanent Invite');

    const payload = botOwnerSend.mock.calls[0][0];
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    const jsonStr = JSON.stringify(payload.components[0].toJSON());
    expect(jsonStr).toContain('Server Join Telemetry Log');
    expect(jsonStr).toContain('New Community');
    expect(jsonStr).toContain('888999000');
    expect(jsonStr).toContain('<@555> (`555`)');
    expect(jsonStr).toContain('<@777> (`777`)');
    expect(jsonStr).toContain('`2` Humans • `3` Bots (`60.0%` Bots)');
    expect(jsonStr).toContain('https://discord.gg/permInvite123');
    expect(jsonStr).toContain('Server Invite Link');
  });

  it('guildDelete sends Components V2 Departure Notice DM to owner', async () => {
    const ownerSend = vi.fn(async () => {});
    const owner = { id: '111', username: 'smith.code', send: ownerSend };

    const client = makeMockClient();
    client.users.fetch.mockResolvedValue(owner);

    const guild = { id: '222', name: 'Old Server', ownerId: '111' };
    await events.guildDelete(client, guild);

    expect(ownerSend).toHaveBeenCalledTimes(1);
    const dmPayload = ownerSend.mock.calls[0][0];
    expect(dmPayload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(dmPayload.components).toHaveLength(1);
    expect(JSON.stringify(dmPayload.components[0].toJSON())).toContain('Old Server');
  });
});
