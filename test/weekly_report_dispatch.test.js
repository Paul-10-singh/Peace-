import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import vcTracker from '../src/utils/vcTracker';

describe('Weekly Report Dispatch to Server Owners', () => {
  const BOT_OWNER_ID = '999000111222333444';
  const SERVER_A_OWNER_ID = '111222333444555666';
  const SERVER_B_OWNER_ID = '222333444555666777';

  let originalOwnerId;

  beforeEach(() => {
    originalOwnerId = process.env.OWNER_ID;
    process.env.OWNER_ID = BOT_OWNER_ID;
  });

  afterEach(() => {
    process.env.OWNER_ID = originalOwnerId;
    vi.restoreAllMocks();
  });

  it('exports sendSundayWeeklyReports function', () => {
    expect(typeof vcTracker.sendSundayWeeklyReports).toBe('function');
  });

  it('records noActivity when guilds have no voice records', async () => {
    const mockGuild = {
      id: 'g1001',
      name: 'Server A',
      ownerId: SERVER_A_OWNER_ID,
      members: { cache: new Map() },
    };

    const mockClient = {
      guilds: {
        cache: new Map([['g1001', mockGuild]]),
      },
      users: {
        fetch: vi.fn(),
      },
    };

    // spy on buildWeeklyReportEmbeds to return []
    vi.spyOn(vcTracker, 'buildWeeklyReportEmbeds').mockResolvedValue([]);

    const results = await vcTracker.sendSundayWeeklyReports(mockClient);
    expect(results.totalGuilds).toBe(1);
    expect(results.noActivity.length).toBe(1);
    expect(results.noActivity[0].id).toBe('g1001');
    expect(results.deliveredToOwnerDm.length).toBe(0);
  });

  it('delivers weekly report directly to Server Owner DM when DMs are open', async () => {
    const ownerSend = vi.fn().mockResolvedValue(true);
    const mockOwner = {
      id: SERVER_A_OWNER_ID,
      send: ownerSend,
    };

    const mockGuild = {
      id: 'g1001',
      name: 'Server A',
      ownerId: SERVER_A_OWNER_ID,
      members: {
        cache: new Map([[SERVER_A_OWNER_ID, mockOwner]]),
      },
    };

    const botOwnerSend = vi.fn().mockResolvedValue(true);
    const mockClient = {
      guilds: {
        cache: new Map([['g1001', mockGuild]]),
      },
      users: {
        fetch: vi.fn().mockImplementation(async (id) => {
          if (id === BOT_OWNER_ID) return { id, send: botOwnerSend };
          return null;
        }),
      },
    };

    const mockEmbed = { title: 'Report' };
    vi.spyOn(vcTracker, 'buildWeeklyReportEmbeds').mockResolvedValue([mockEmbed]);

    const results = await vcTracker.sendSundayWeeklyReports(mockClient);
    expect(results.totalGuilds).toBe(1);
    expect(results.deliveredToOwnerDm.length).toBe(1);
    expect(results.deliveredToOwnerDm[0].ownerId).toBe(SERVER_A_OWNER_ID);
    expect(ownerSend).toHaveBeenCalled();
    expect(botOwnerSend).toHaveBeenCalled();
  });

  it('falls back to server text channel when Server Owner DM fails (DMs closed)', async () => {
    const ownerSend = vi.fn().mockRejectedValue(new Error('Cannot send messages to this user'));
    const mockOwner = {
      id: SERVER_B_OWNER_ID,
      send: ownerSend,
    };

    const channelSend = vi.fn().mockResolvedValue(true);
    const mockSystemChannel = {
      id: 'c999',
      isTextBased: () => true,
      isVoiceBased: () => false,
      isThread: () => false,
      permissionsFor: () => ({ has: () => true }),
      send: channelSend,
    };

    const mockGuild = {
      id: 'g1002',
      name: 'Server B',
      ownerId: SERVER_B_OWNER_ID,
      systemChannel: mockSystemChannel,
      members: {
        cache: new Map([[SERVER_B_OWNER_ID, mockOwner]]),
        me: { id: 'botId' },
      },
      channels: {
        cache: new Map([['c999', mockSystemChannel]]),
      },
    };

    const botOwnerSend = vi.fn().mockResolvedValue(true);
    const mockClient = {
      guilds: {
        cache: new Map([['g1002', mockGuild]]),
      },
      users: {
        fetch: vi.fn().mockImplementation(async (id) => {
          if (id === BOT_OWNER_ID) return { id, send: botOwnerSend };
          return null;
        }),
      },
    };

    const mockEmbed = { title: 'Report' };
    vi.spyOn(vcTracker, 'buildWeeklyReportEmbeds').mockResolvedValue([mockEmbed]);

    const results = await vcTracker.sendSundayWeeklyReports(mockClient);
    expect(results.deliveredToOwnerDm.length).toBe(0);
    expect(results.fallbackToChannel.length).toBe(1);
    expect(results.fallbackToChannel[0].channelId).toBe('c999');
    expect(channelSend).toHaveBeenCalled();
  });
});
