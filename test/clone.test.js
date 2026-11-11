import { describe, it, expect, vi } from 'vitest';
const {
  ChannelType,
  OverwriteType,
  PermissionsBitField,
  StickerFormatType,
} = require('discord.js');

const cloneCmd = require('../src/commands/owner/clone');
const {
  cleanAssetName,
  clampPermissions,
  getTierMaxBitrate,
  getEmojiSlotLimit,
  getStickerSlotLimit,
  cloneServerSettings,
  cloneRolesAndPermissions,
  cloneChannels,
  cloneExpressions,
  executeFullClone,
} = require('../src/utils/serverClone');
const {
  createCloneSession,
  getCloneSession,
  deleteCloneSession,
  validatePermissionsForMode,
  buildClonePanelPayload,
  buildWipeConfirmPayload,
  buildCloneResultEmbed,
  handleClonePanelInteraction,
} = require('../src/utils/clonePanel');
const { getBotOwnerIds } = require('../src/utils/owners');

function createMockGuild({
  id = 'guild_1',
  name = 'Guild',
  premiumTier = 0,
  features = [],
  roles = [],
  channels = [],
  emojis = [],
  stickers = [],
  mePermissions = [PermissionsBitField.Flags.Administrator],
  botHighestPos = 50,
  members = [],
  extra = {},
} = {}) {
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const emojiMap = new Map(emojis.map((e) => [e.id, e]));
  const stickerMap = new Map(stickers.map((s) => [s.id, s]));
  const memberMap = new Map(members.map((m) => [m.id, m]));

  let seq = 1000;
  const createdRoles = [];
  const deletedRoleIds = [];
  const createdChannels = [];
  const deletedChannelIds = [];
  const createdEmojis = [];
  const createdStickers = [];
  const editCalls = [];

  const guild = {
    id,
    name,
    premiumTier,
    features,
    verificationLevel: extra.verificationLevel ?? 1,
    explicitContentFilter: extra.explicitContentFilter ?? 1,
    defaultMessageNotifications: extra.defaultMessageNotifications ?? 1,
    afkTimeout: extra.afkTimeout ?? 300,
    preferredLocale: extra.preferredLocale ?? 'en-US',
    afkChannelId: extra.afkChannelId ?? null,
    systemChannelId: extra.systemChannelId ?? null,
    systemChannelFlags: extra.systemChannelFlags ?? 0,
    rulesChannelId: extra.rulesChannelId ?? null,
    publicUpdatesChannelId: extra.publicUpdatesChannelId ?? null,
    icon: extra.icon ?? null,
    banner: extra.banner ?? null,
    splash: extra.splash ?? null,
    description: extra.description ?? null,
    iconURL: ({ extension = 'png' } = {}) =>
      guild.icon ? `https://cdn.discordapp.com/icons/${id}/${guild.icon}.${extension}` : null,
    bannerURL: ({ extension = 'png' } = {}) =>
      guild.banner ? `https://cdn.discordapp.com/banners/${id}/${guild.banner}.${extension}` : null,
    splashURL: ({ extension = 'png' } = {}) =>
      guild.splash ? `https://cdn.discordapp.com/splashes/${id}/${guild.splash}.${extension}` : null,
    edit: vi.fn(async (payload) => {
      editCalls.push(payload);
      if (payload.name) guild.name = payload.name;
      return guild;
    }),
    roles: {
      cache: roleMap,
      everyone: roleMap.get(id) || roles.find((r) => r.name === '@everyone') || null,
      fetch: vi.fn(async () => roleMap),
      create: vi.fn(async (payload) => {
        const roleId = `new_role_${++seq}`;
        const created = { id: roleId, ...payload };
        createdRoles.push(payload);
        roleMap.set(roleId, created);
        return created;
      }),
    },
    channels: {
      cache: channelMap,
      fetch: vi.fn(async () => channelMap),
      create: vi.fn(async (payload) => {
        const chId = `new_ch_${++seq}`;
        const created = {
          id: chId,
          ...payload,
          permissionsFor: () => new PermissionsBitField(mePermissions),
        };
        createdChannels.push(payload);
        channelMap.set(chId, created);
        return created;
      }),
    },
    emojis: {
      cache: emojiMap,
      fetch: vi.fn(async () => emojiMap),
      create: vi.fn(async (payload) => {
        const eId = `new_emoji_${++seq}`;
        const animated = String(payload.attachment || '').endsWith('.gif');
        const created = { id: eId, name: payload.name, animated };
        createdEmojis.push(payload);
        emojiMap.set(eId, created);
        return created;
      }),
    },
    stickers: {
      cache: stickerMap,
      fetch: vi.fn(async () => stickerMap),
      create: vi.fn(async (payload) => {
        const sId = `new_sticker_${++seq}`;
        const created = { id: sId, ...payload };
        createdStickers.push(payload);
        stickerMap.set(sId, created);
        return created;
      }),
    },
    members: {
      cache: memberMap,
      me: {
        permissions: new PermissionsBitField(mePermissions),
        roles: { highest: { position: botHighestPos } },
      },
      fetchMe: vi.fn(async () => guild.members.me),
      fetch: vi.fn(async (uid) => memberMap.get(uid) || null),
    },
    __spies: {
      createdRoles,
      deletedRoleIds,
      createdChannels,
      deletedChannelIds,
      createdEmojis,
      createdStickers,
      editCalls,
    },
  };

  // Wire delete tracking on mock roles and channels
  for (const r of roles) {
    if (!r.delete) {
      r.delete = vi.fn(async () => {
        deletedRoleIds.push(r.id);
        roleMap.delete(r.id);
      });
    }
    if (r.name === '@everyone' && !r.setPermissions) {
      r.setPermissions = vi.fn(async (perms) => {
        r.permissions = perms;
      });
    }
  }
  for (const c of channels) {
    if (!c.delete) {
      c.delete = vi.fn(async () => {
        deletedChannelIds.push(c.id);
        channelMap.delete(c.id);
      });
    }
  }

  return guild;
}

describe('/clone all Command & Engine', () => {
  it('registers /clone all with source, destination, optional type choices, and autocomplete', () => {
    const json = cloneCmd.data.toJSON();
    expect(json.name).toBe('clone');
    expect(cloneCmd.botOwnerOnly).toBe(true);
    expect(typeof cloneCmd.autocomplete).toBe('function');

    const sub = json.options.find((o) => o.name === 'all');
    expect(sub).toBeDefined();
    expect(sub.options.find((o) => o.name === 'source')?.required).toBe(true);
    expect(sub.options.find((o) => o.name === 'destination')?.required).toBe(false);
    const typeOpt = sub.options.find((o) => o.name === 'type');
    expect(typeOpt.choices.map((c) => c.value)).toEqual(['server', 'expressions', 'both']);
  });

  it('computes accurate boost tier caps and helper limits', () => {
    expect(getTierMaxBitrate({ premiumTier: 0 })).toBe(96000);
    expect(getTierMaxBitrate({ premiumTier: 3 })).toBe(384000);
    expect(getEmojiSlotLimit({ premiumTier: 0 })).toBe(50);
    expect(getEmojiSlotLimit({ premiumTier: 3 })).toBe(250);
    expect(getStickerSlotLimit({ premiumTier: 0 })).toBe(5);
    expect(getStickerSlotLimit({ premiumTier: 2 })).toBe(30);
    expect(cleanAssetName('a!@#', 30, 'sticker')).toBe('a_');
    expect(cleanAssetName('!', 30, 'sticker')).toBe('_sticker');

    const botPerms = new PermissionsBitField([
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.SendMessages,
    ]);
    const clamped = clampPermissions(
      new PermissionsBitField([
        PermissionsBitField.Flags.Administrator,
        PermissionsBitField.Flags.ManageChannels,
      ]),
      botPerms,
    );
    expect(clamped.has(PermissionsBitField.Flags.ManageChannels)).toBe(true);
    expect(clamped.has(PermissionsBitField.Flags.Administrator)).toBe(false);
  });

  it('clones server settings (Phase 1 & Phase 2) and respects boost/community gates', async () => {
    const source = createMockGuild({
      id: 'src_1',
      name: 'TNC OFFICIAL',
      premiumTier: 3,
      extra: {
        icon: 'a_iconhash',
        banner: 'bannerhash',
        splash: 'splashhash',
        verificationLevel: 0,
        explicitContentFilter: 1,
        defaultMessageNotifications: 1,
        afkTimeout: 900,
        afkChannelId: 'src_vc_afk',
        systemChannelId: 'src_txt_sys',
      },
    });
    const dest = createMockGuild({
      id: 'dst_1',
      name: 'Target Server',
      premiumTier: 0,
      features: ['COMMUNITY'],
    });

    const p1 = await cloneServerSettings(source, dest, { phase: 1 });
    expect(p1.updated).toContain('Name & Core Settings');
    expect(p1.updated).toContain('Server Icon');
    expect(p1.skipped.some((s) => s.includes('Server Banner'))).toBe(true);
    expect(p1.skipped.some((s) => s.includes('Verification Level None'))).toBe(true);
    expect(p1.skipped.some((s) => s.includes('Explicit Content Filter'))).toBe(true);

    // Phase 1 with PNG icon on non-boosted tier
    expect(dest.__spies.editCalls[0].icon).toBe('https://cdn.discordapp.com/icons/src_1/a_iconhash.png');
    expect(dest.__spies.editCalls[0].name).toBe('TNC OFFICIAL');

    const chMap = new Map([
      ['src_vc_afk', 'dst_vc_afk'],
      ['src_txt_sys', 'dst_txt_sys'],
    ]);
    const p2 = await cloneServerSettings(source, dest, { phase: 2, channelIdMap: chMap });
    expect(p2.updated).toContain('AFK & System Channels');
    const linkCall = dest.__spies.editCalls.at(-1);
    expect(linkCall.afkChannel).toBe('dst_vc_afk');
    expect(linkCall.systemChannel).toBe('dst_txt_sys');
  });

  it('clones roles descending by position, wipes deletable roles, syncs @everyone, and clamps permissions', async () => {
    const srcEveryone = {
      id: 'src_2',
      name: '@everyone',
      position: 0,
      permissions: new PermissionsBitField([PermissionsBitField.Flags.ViewChannel]),
    };
    const dstEveryone = {
      id: 'dst_2',
      name: '@everyone',
      position: 0,
      permissions: new PermissionsBitField(),
    };

    const source = createMockGuild({
      id: 'src_2',
      roles: [
        srcEveryone,
        {
          id: 'r_bot',
          name: 'SomeBot',
          managed: true,
          position: 10,
          permissions: new PermissionsBitField([PermissionsBitField.Flags.Administrator]),
        },
        {
          id: 'r_member',
          name: 'Member',
          position: 1,
          color: 0x00ff00,
          hoist: false,
          mentionable: false,
          permissions: new PermissionsBitField([PermissionsBitField.Flags.SendMessages]),
        },
        {
          id: 'r_admin',
          name: 'Admin',
          position: 5,
          colors: { primaryColor: 0xff0000 },
          hoist: true,
          mentionable: true,
          permissions: new PermissionsBitField([
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.BanMembers,
          ]),
        },
      ],
    });

    const dest = createMockGuild({
      id: 'dst_2',
      mePermissions: [
        PermissionsBitField.Flags.ManageRoles,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
      ],
      botHighestPos: 5,
      roles: [
        dstEveryone,
        { id: 'd_old', name: 'OldRole', position: 2, managed: false },
        { id: 'd_high', name: 'OwnerTop', position: 7, managed: false },
        { id: 'd_managed', name: 'BotManaged', position: 3, managed: true },
      ],
    });

    const res = await cloneRolesAndPermissions(source, dest, { wipe: true });
    expect(res.deletedRoles).toBe(1);
    expect(dest.__spies.deletedRoleIds).toEqual(['d_old']);
    expect(res.everyoneUpdated).toBe(true);
    expect(res.createdRoles).toBe(2); // skips managed role
    // Descending creation: Admin (pos 5) created before Member (pos 1)
    expect(dest.__spies.createdRoles[0].name).toBe('Admin');
    expect(dest.__spies.createdRoles[1].name).toBe('Member');
    // Clamped permission check: bot lacked BanMembers so Admin only keeps ManageChannels
    const adminPerms = new PermissionsBitField(dest.__spies.createdRoles[0].permissions);
    expect(adminPerms.has(PermissionsBitField.Flags.ManageChannels)).toBe(true);
    expect(adminPerms.has(PermissionsBitField.Flags.BanMembers)).toBe(false);
    expect(res.roleIdMap.get('src_2')).toBe('dst_2');
    expect(res.roleIdMap.has('r_admin')).toBe(true);
    expect(res.roleIdMap.has('r_member')).toBe(true);
  });

  it('clones categories, text channels, voice channels, overwrites, bitrates & protects interaction channel', async () => {
    const source = createMockGuild({
      id: 'src_3',
      premiumTier: 3,
      channels: [
        {
          id: 'cat_1',
          name: 'Community',
          type: ChannelType.GuildCategory,
          rawPosition: 0,
          permissionOverwrites: {
            cache: new Map([
              [
                'src_3',
                {
                  id: 'src_3',
                  type: OverwriteType.Role,
                  allow: 0n,
                  deny: PermissionsBitField.Flags.SendMessages,
                },
              ],
            ]),
          },
        },
        {
          id: 'txt_ann',
          name: 'announcements',
          type: ChannelType.GuildAnnouncement,
          parentId: 'cat_1',
          rawPosition: 1,
          topic: 'Important updates',
          rateLimitPerUser: 5,
          nsfw: false,
          permissionOverwrites: {
            cache: new Map([
              [
                'r_mod',
                {
                  id: 'r_mod',
                  type: OverwriteType.Role,
                  allow: PermissionsBitField.Flags.SendMessages,
                  deny: 0n,
                },
              ],
              [
                'missing_user',
                {
                  id: 'missing_user',
                  type: OverwriteType.Member,
                  allow: PermissionsBitField.Flags.ViewChannel,
                  deny: 0n,
                },
              ],
            ]),
          },
        },
        {
          id: 'vc_high',
          name: 'Lounge',
          type: ChannelType.GuildVoice,
          parentId: 'cat_1',
          rawPosition: 2,
          bitrate: 384000,
          userLimit: 10,
          permissionOverwrites: { cache: new Map() },
        },
      ],
    });

    const dest = createMockGuild({
      id: 'dst_3',
      premiumTier: 0,
      features: [], // No NEWS or COMMUNITY
      channels: [
        { id: 'protect_ch', name: 'clone-cmd', type: ChannelType.GuildText },
        { id: 'old_general', name: 'general', type: ChannelType.GuildText },
      ],
    });

    const roleIdMap = new Map([
      ['src_3', 'dst_3'],
      ['r_mod', 'dst_mod_role'],
    ]);

    const res = await cloneChannels(source, dest, {
      textChannels: true,
      voiceChannels: true,
      rolePermissions: true,
      wipe: true,
      roleIdMap,
      protectChannelId: 'protect_ch',
    });

    expect(dest.__spies.deletedChannelIds).toEqual(['old_general']);
    expect(dest.__spies.deletedChannelIds).not.toContain('protect_ch');
    expect(res.createdCategories).toBe(1);
    expect(res.createdTextChannels).toBe(1);
    expect(res.createdVoiceChannels).toBe(1);

    const createdText = dest.__spies.createdChannels.find((c) => c.name === 'announcements');
    expect(createdText.type).toBe(ChannelType.GuildText); // downgraded from Announcement
    expect(createdText.parent).toBe(res.channelIdMap.get('cat_1'));
    expect(createdText.permissionOverwrites.length).toBe(1);
    expect(createdText.permissionOverwrites[0].id).toBe('dst_mod_role');

    const createdVc = dest.__spies.createdChannels.find((c) => c.name === 'Lounge');
    expect(createdVc.bitrate).toBe(96000); // clamped from 384k to Tier 0 max (96k)
    expect(createdVc.userLimit).toBe(10);
    expect(res.converted).toContain('#announcements: Announcement → Text');
  });

  it('clones static emojis, animated GIFs & stickers respecting caps and skipping Lottie stickers', async () => {
    const source = createMockGuild({
      id: 'src_4',
      emojis: [
        {
          id: 'e1',
          name: 'pepe_ok',
          animated: false,
          imageURL: () => 'https://cdn.discordapp.com/emojis/e1.png',
        },
        {
          id: 'e2',
          name: 'dance_gif',
          animated: true,
          imageURL: () => 'https://cdn.discordapp.com/emojis/e2.gif',
        },
      ],
      stickers: [
        {
          id: 's1',
          name: 'hello_png',
          description: 'hi',
          tags: 'wave',
          format: StickerFormatType.PNG,
          url: 'https://cdn.discordapp.com/stickers/s1.png',
        },
        {
          id: 's2',
          name: 'lottie_anim',
          description: 'lottie',
          tags: 'cool',
          format: StickerFormatType.Lottie,
          url: 'https://cdn.discordapp.com/stickers/s2.json',
        },
      ],
    });
    const dest = createMockGuild({ id: 'dst_4', premiumTier: 0 });

    const res = await cloneExpressions(source, dest);
    expect(res.copiedStatic).toBe(1);
    expect(res.copiedGifs).toBe(1);
    expect(res.copiedStickers).toBe(1);
    expect(res.totalStickers).toBe(2);
    expect(res.skipped.some((s) => s.includes('Lottie'))).toBe(true);
  });

  it('executeFullClone supports server, expressions, and both modes cleanly', async () => {
    const src = createMockGuild({
      id: 'src_full',
      name: 'Origin',
      roles: [
        { id: 'src_full', name: '@everyone', position: 0, permissions: new PermissionsBitField() },
        { id: 'r1', name: 'VIP', position: 2, permissions: new PermissionsBitField([PermissionsBitField.Flags.ViewChannel]) },
      ],
      channels: [
        { id: 'c_txt', name: 'chat', type: ChannelType.GuildText, rawPosition: 0 },
        { id: 'c_vc', name: 'talk', type: ChannelType.GuildVoice, rawPosition: 1, bitrate: 64000 },
      ],
      emojis: [{ id: 'e1', name: 'star', animated: false, imageURL: () => 'https://x/e1.png' }],
      extra: { systemChannelId: 'c_txt', afkChannelId: 'c_vc' },
    });
    const dst = createMockGuild({
      id: 'dst_full',
      name: 'Dest',
      roles: [{ id: 'dst_full', name: '@everyone', position: 0, permissions: new PermissionsBitField() }],
    });

    const summary = await executeFullClone({
      sourceGuild: src,
      destinationGuild: dst,
      mode: 'both',
      options: { textChannels: true, voiceChannels: true, serverSettings: true, rolePermissions: true, wipeExisting: false },
    });

    expect(summary.settings.updated).toContain('AFK & System Channels');
    expect(summary.roles.createdRoles).toBe(1);
    expect(summary.channels.createdTextChannels).toBe(1);
    expect(summary.channels.createdVoiceChannels).toBe(1);
    expect(summary.expressions.copiedStatic).toBe(1);
  });

  it('clonePanel builds interactive panel, toggles options, shows wipe confirm, and blocks unauthorized users', async () => {
    const ownerIds = getBotOwnerIds();
    const ownerId = ownerIds[0] || '999999999999999999';
    if (!ownerIds.length) process.env.OWNER_ID = ownerId;

    const src = createMockGuild({ id: 'panel_src', name: 'Source' });
    const dst = createMockGuild({ id: 'panel_dst', name: 'Dest' });

    const session = createCloneSession({ userId: ownerId, sourceGuild: src, destinationGuild: dst });
    expect(getCloneSession(session.id)).not.toBeNull();

    const panel = buildClonePanelPayload(session, src, dst);
    const row1 = panel.components[0].toJSON();
    const row2 = panel.components[1].toJSON();
    expect(row1.components.map((b) => b.label)).toEqual([
      'Clone Server',
      'Emoji, Stickers, GIF',
      'Clone Both',
      'Cancel',
    ]);
    expect(row2.components.map((b) => b.label)).toEqual([
      'Text Channels',
      'Voice Channels',
      'Server Settings',
      'Roles & Perms',
      'Wipe Dest',
    ]);

    // Unauthorized click
    const mockOwnerUser = { id: ownerId, username: 'Owner', displayAvatarURL: () => null };
    const unauthReply = vi.fn(async () => {});
    await handleClonePanelInteraction({
      customId: `clone:toggle:textChannels:${session.id}`,
      user: { id: 'intruder_123', username: 'Intruder', displayAvatarURL: () => null },
      client: { guilds: { cache: new Map([['panel_src', src], ['panel_dst', dst]]) } },
      reply: unauthReply,
    });
    expect(unauthReply).toHaveBeenCalled();

    // Authorized toggle click
    const updateFn = vi.fn(async () => {});
    await handleClonePanelInteraction({
      customId: `clone:toggle:serverSettings:${session.id}`,
      user: mockOwnerUser,
      client: { guilds: { cache: new Map([['panel_src', src], ['panel_dst', dst]]) } },
      update: updateFn,
    });
    expect(session.options.serverSettings).toBe(false);
    expect(updateFn).toHaveBeenCalled();

    // Clicking Clone Server with wipeExisting=true opens confirm prompt
    const confirmUpdate = vi.fn(async () => {});
    await handleClonePanelInteraction({
      customId: `clone:mode:server:${session.id}`,
      user: mockOwnerUser,
      client: { guilds: { cache: new Map([['panel_src', src], ['panel_dst', dst]]) } },
      update: confirmUpdate,
    });
    const sentConfirm = confirmUpdate.mock.calls[0][0];
    expect(sentConfirm.components[0].toJSON().components.map((c) => c.label)).toEqual([
      'Wipe & Clone',
      'Keep Existing & Clone',
      'Back',
    ]);

    const permCheck = validatePermissionsForMode(
      createMockGuild({ mePermissions: [PermissionsBitField.Flags.ManageGuildExpressions] }),
      'server',
      { textChannels: true, voiceChannels: false, serverSettings: false, rolePermissions: true },
    );
    expect(permCheck.ok).toBe(false);
    expect(permCheck.missing.length).toBe(2);

    const exprPermOk = validatePermissionsForMode(
      createMockGuild({ mePermissions: [PermissionsBitField.Flags.CreateGuildExpressions] }),
      'expressions',
      {},
    );
    expect(exprPermOk.ok).toBe(true);

    const confirmObj = buildWipeConfirmPayload(session, src, dst, 'both');
    expect(confirmObj.embeds[0].data.title).toContain('Confirm Server Clone');

    const resEmbed = buildCloneResultEmbed(
      {
        mode: 'both',
        settings: { updated: ['Name & Core Settings'], skipped: [] },
        roles: { createdRoles: 3, everyoneUpdated: true, deletedRoles: 1, skipped: [] },
        channels: { createdCategories: 2, createdTextChannels: 5, createdVoiceChannels: 3, deletedChannels: 2, converted: [], skipped: [] },
        expressions: { copiedStatic: 10, totalStatic: 10, copiedGifs: 4, totalGifs: 5, copiedStickers: 2, totalStickers: 2, skipped: [] },
      },
      src,
      dst,
    );
    expect(resEmbed.data.fields.length).toBe(4);

    deleteCloneSession(session.id);
  });
});
