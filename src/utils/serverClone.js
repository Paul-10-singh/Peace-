/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Server & Expression Cloning Engine
 * Supports cloning:
 *  - Server Settings (name, icon, banner, splash, verification, filters, notifications, AFK/system)
 *  - Roles & Role Permissions (hierarchy, colors, hoist, mentionable, clamped permissions, @everyone)
 *  - Categories, Text Channels, Voice Channels & Permission Overwrites
 *  - Expressions (Static Emojis, Animated GIFs, Stickers)
 */
const {
  ChannelType,
  OverwriteType,
  PermissionsBitField,
  StickerFormatType,
} = require('discord.js');

const EMOJI_SLOT_LIMITS = { 0: 50, 1: 100, 2: 150, 3: 250 };
const STICKER_SLOT_LIMITS = { 0: 5, 1: 15, 2: 30, 3: 60 };
const VOICE_MAX_BITRATE = { 0: 96000, 1: 128000, 2: 256000, 3: 384000 };

const TEXT_LIKE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

const VOICE_LIKE_TYPES = new Set([
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);

function toArray(collectionOrMap) {
  if (!collectionOrMap) return [];
  if (Array.isArray(collectionOrMap)) return collectionOrMap;
  if (typeof collectionOrMap.values === 'function') return [...collectionOrMap.values()];
  return Object.values(collectionOrMap);
}

function cleanAssetName(name, max = 32, fallback = 'cloned_item') {
  const cleaned = String(name || '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, max);
  if (cleaned.length >= 2) return cleaned;
  return (cleaned + fallback).slice(0, max);
}

function clampPermissions(rawPerms, mePerms) {
  const bits = new PermissionsBitField(rawPerms || 0n);
  if (!mePerms) return bits;
  if (typeof mePerms.has === 'function' && mePerms.has(PermissionsBitField.Flags.Administrator)) {
    return bits;
  }
  const meBit = mePerms.bitfield ?? new PermissionsBitField(mePerms).bitfield;
  return new PermissionsBitField(bits.bitfield & meBit);
}

function getTierMaxBitrate(guild) {
  if (guild?.maximumBitrate) return guild.maximumBitrate;
  return VOICE_MAX_BITRATE[guild?.premiumTier || 0] || 96000;
}

function getEmojiSlotLimit(guild) {
  return EMOJI_SLOT_LIMITS[guild?.premiumTier || 0] || 50;
}

function getStickerSlotLimit(guild) {
  if (guild?.stickerLimit) return guild.stickerLimit;
  return STICKER_SLOT_LIMITS[guild?.premiumTier || 0] || 5;
}

function hasFeature(guild, feature) {
  return Array.isArray(guild?.features) && guild.features.includes(feature);
}

async function reportProgress(onProgress, stage, detail = '') {
  if (typeof onProgress !== 'function') return;
  try {
    await onProgress({ stage, detail });
  } catch {
    // Progress callbacks should never abort cloning
  }
}

/**
 * Clones basic server settings (Phase 1: pre-channels, Phase 2: AFK & system channels).
 */
async function cloneServerSettings(sourceGuild, destGuild, { phase = 1, channelIdMap = null, reason } = {}) {
  const auditReason = reason || `Peace✘ /clone all from ${sourceGuild.name}`;
  const updated = [];
  const skipped = [];

  if (phase === 1) {
    const destFeatures = destGuild.features || [];
    const isCommunity = destFeatures.includes('COMMUNITY');
    const tier = destGuild.premiumTier || 0;

    // 1. Core metadata: name, icon, afkTimeout, notifications, verification, content filter
    const basePayload = {
      name: sourceGuild.name,
      afkTimeout: sourceGuild.afkTimeout,
      defaultMessageNotifications: sourceGuild.defaultMessageNotifications,
      reason: auditReason,
    };

    if (typeof sourceGuild.verificationLevel === 'number') {
      // Community servers disallow VerificationLevel.None (0)
      if (!isCommunity || sourceGuild.verificationLevel > 0) {
        basePayload.verificationLevel = sourceGuild.verificationLevel;
      } else {
        skipped.push('Verification Level None (destination Community server requires >= Low)');
      }
    }

    if (typeof sourceGuild.explicitContentFilter === 'number') {
      // Community servers require explicitContentFilter === 2 (AllMembers)
      if (!isCommunity || sourceGuild.explicitContentFilter === 2) {
        basePayload.explicitContentFilter = sourceGuild.explicitContentFilter;
      } else {
        skipped.push('Explicit Content Filter (destination Community server locks this setting)');
      }
    }

    if (sourceGuild.preferredLocale) {
      basePayload.preferredLocale = sourceGuild.preferredLocale;
    }

    if (typeof sourceGuild.iconURL === 'function') {
      const isAnimatedIcon = String(sourceGuild.icon || '').startsWith('a_');
      const canAnimatedIcon = tier >= 1 || destFeatures.includes('ANIMATED_ICON');
      const iconUrl = sourceGuild.iconURL({
        size: 1024,
        extension: isAnimatedIcon && canAnimatedIcon ? 'gif' : 'png',
      });
      if (iconUrl) basePayload.icon = iconUrl;
    }

    try {
      await destGuild.edit(basePayload);
      updated.push('Name & Core Settings');
      if (basePayload.icon) updated.push('Server Icon');
    } catch (err) {
      // Fallback: try at minimum name + icon if a moderation/verification level failed
      try {
        await destGuild.edit({
          name: sourceGuild.name,
          ...(basePayload.icon ? { icon: basePayload.icon } : {}),
          reason: auditReason,
        });
        updated.push('Name & Icon');
        skipped.push(`Some core settings skipped (${err.message})`);
      } catch (innerErr) {
        skipped.push(`Core server settings (${innerErr.message})`);
      }
    }

    // 2. Boost/feature-gated assets (Banner, Splash, Description) applied independently
    if (typeof sourceGuild.bannerURL === 'function' && sourceGuild.banner) {
      if (tier >= 2 || hasFeature(destGuild, 'BANNER')) {
        const isAnimatedBanner = String(sourceGuild.banner).startsWith('a_');
        const bannerUrl = sourceGuild.bannerURL({
          size: 1024,
          extension: isAnimatedBanner && (tier >= 3 || hasFeature(destGuild, 'ANIMATED_BANNER')) ? 'gif' : 'png',
        });
        if (bannerUrl) {
          try {
            await destGuild.edit({ banner: bannerUrl, reason: auditReason });
            updated.push('Server Banner');
          } catch (err) {
            skipped.push(`Server Banner (${err.message})`);
          }
        }
      } else {
        skipped.push('Server Banner (destination server needs Boost Level 2+)');
      }
    }

    if (typeof sourceGuild.splashURL === 'function' && sourceGuild.splash) {
      if (tier >= 1 || hasFeature(destGuild, 'INVITE_SPLASH')) {
        const splashUrl = sourceGuild.splashURL({ size: 1024, extension: 'png' });
        if (splashUrl) {
          try {
            await destGuild.edit({ splash: splashUrl, reason: auditReason });
            updated.push('Invite Splash');
          } catch (err) {
            skipped.push(`Invite Splash (${err.message})`);
          }
        }
      } else {
        skipped.push('Invite Splash (destination server needs Boost Level 1+)');
      }
    }

    if (sourceGuild.description && (isCommunity || hasFeature(destGuild, 'VERIFIED'))) {
      try {
        await destGuild.edit({ description: sourceGuild.description, reason: auditReason });
        updated.push('Server Description');
      } catch (err) {
        skipped.push(`Server Description (${err.message})`);
      }
    }
  }

  if (phase === 2 && channelIdMap && channelIdMap.size > 0) {
    const channelLinkPayload = { reason: auditReason };
    let hasLinks = false;

    if (sourceGuild.afkChannelId && channelIdMap.has(sourceGuild.afkChannelId)) {
      channelLinkPayload.afkChannel = channelIdMap.get(sourceGuild.afkChannelId);
      hasLinks = true;
    }

    if (sourceGuild.systemChannelId && channelIdMap.has(sourceGuild.systemChannelId)) {
      channelLinkPayload.systemChannel = channelIdMap.get(sourceGuild.systemChannelId);
      if (sourceGuild.systemChannelFlags !== undefined) {
        channelLinkPayload.systemChannelFlags =
          sourceGuild.systemChannelFlags?.bitfield ?? sourceGuild.systemChannelFlags;
      }
      hasLinks = true;
    }

    if (hasFeature(destGuild, 'COMMUNITY')) {
      if (sourceGuild.rulesChannelId && channelIdMap.has(sourceGuild.rulesChannelId)) {
        channelLinkPayload.rulesChannel = channelIdMap.get(sourceGuild.rulesChannelId);
        hasLinks = true;
      }
      if (sourceGuild.publicUpdatesChannelId && channelIdMap.has(sourceGuild.publicUpdatesChannelId)) {
        channelLinkPayload.publicUpdatesChannel = channelIdMap.get(sourceGuild.publicUpdatesChannelId);
        hasLinks = true;
      }
    }

    if (hasLinks) {
      try {
        await destGuild.edit(channelLinkPayload);
        updated.push('AFK & System Channels');
      } catch (err) {
        skipped.push(`AFK/System channel links (${err.message})`);
      }
    }
  }

  return { updated, skipped };
}

/**
 * Clones roles and role permissions from sourceGuild to destGuild.
 * Builds a Map<sourceRoleId, destRoleId> including @everyone.
 */
async function cloneRolesAndPermissions(
  sourceGuild,
  destGuild,
  { wipe = false, onProgress, reason } = {},
) {
  const auditReason = reason || `Peace✘ /clone all from ${sourceGuild.name}`;
  const roleIdMap = new Map();
  roleIdMap.set(sourceGuild.id, destGuild.id);

  const me =
    destGuild.members?.me ||
    (destGuild.members?.fetchMe ? await destGuild.members.fetchMe().catch(() => null) : null);
  const mePerms = me?.permissions || null;
  const botTopPos = me?.roles?.highest?.position ?? Infinity;

  const sourceRolesRaw = sourceGuild.roles?.fetch
    ? await sourceGuild.roles.fetch().catch(() => sourceGuild.roles?.cache)
    : sourceGuild.roles?.cache;
  const destRolesRaw = destGuild.roles?.fetch
    ? await destGuild.roles.fetch().catch(() => destGuild.roles?.cache)
    : destGuild.roles?.cache;

  const sourceRoles = toArray(sourceRolesRaw);
  const destRoles = toArray(destRolesRaw);

  let deletedRoles = 0;
  let createdRoles = 0;
  let everyoneUpdated = false;
  const skipped = [];

  // 1. Delete existing deletable roles if wiping
  if (wipe) {
    await reportProgress(onProgress, 'Roles & Permissions', 'Clearing existing roles...');
    for (const role of destRoles) {
      if (!role || role.id === destGuild.id || role.managed) continue;
      if (role.position >= botTopPos) {
        skipped.push(`Keep role @${role.name} (above bot's highest role)`);
        continue;
      }
      try {
        await role.delete(auditReason);
        deletedRoles += 1;
      } catch (err) {
        skipped.push(`Delete role @${role.name} (${err.message})`);
      }
    }
  }

  // 2. Sync @everyone permissions
  const sourceEveryone = sourceRoles.find((r) => r.id === sourceGuild.id || r.name === '@everyone');
  const destEveryone =
    destGuild.roles?.everyone || destRoles.find((r) => r.id === destGuild.id || r.name === '@everyone');
  if (sourceEveryone && destEveryone && typeof destEveryone.setPermissions === 'function') {
    try {
      const clamped = clampPermissions(sourceEveryone.permissions, mePerms);
      await destEveryone.setPermissions(clamped, auditReason);
      everyoneUpdated = true;
    } catch (err) {
      skipped.push(`@everyone permissions (${err.message})`);
    }
  }

  // 3. Create custom roles descending (highest source position first) so Discord's
  // position=1 insertion produces the exact hierarchy bottom-to-top automatically.
  const customSourceRoles = sourceRoles
    .filter((r) => r && r.id !== sourceGuild.id && r.name !== '@everyone' && !r.managed)
    .sort((a, b) => (b.position || 0) - (a.position || 0));

  const canRoleIcons = hasFeature(destGuild, 'ROLE_ICONS') || (destGuild.premiumTier || 0) >= 2;
  const createdPairs = [];

  for (let i = 0; i < customSourceRoles.length; i += 1) {
    const srcRole = customSourceRoles[i];
    if (i % 5 === 0) {
      await reportProgress(
        onProgress,
        'Roles & Permissions',
        `Creating roles (${i + 1}/${customSourceRoles.length})...`,
      );
    }

    const clampedPerms = clampPermissions(srcRole.permissions, mePerms);
    const primaryColor = srcRole.colors?.primaryColor ?? srcRole.color ?? 0;
    const colorsPayload = { primaryColor };
    if (srcRole.colors?.secondaryColor != null) {
      colorsPayload.secondaryColor = srcRole.colors.secondaryColor;
    }
    if (srcRole.colors?.tertiaryColor != null) {
      colorsPayload.tertiaryColor = srcRole.colors.tertiaryColor;
    }

    const createPayload = {
      name: srcRole.name.slice(0, 100),
      colors: colorsPayload,
      hoist: Boolean(srcRole.hoist),
      mentionable: Boolean(srcRole.mentionable),
      permissions: clampedPerms,
      reason: auditReason,
    };

    if (canRoleIcons) {
      if (typeof srcRole.iconURL === 'function' && srcRole.icon) {
        const iconUrl = srcRole.iconURL({ extension: 'png', size: 128 });
        if (iconUrl) createPayload.icon = iconUrl;
      } else if (srcRole.unicodeEmoji) {
        createPayload.unicodeEmoji = srcRole.unicodeEmoji;
      }
    }

    try {
      const created = await destGuild.roles.create(createPayload);
      roleIdMap.set(srcRole.id, created.id);
      createdPairs.push({ sourcePos: srcRole.position || 0, role: created });
      createdRoles += 1;
    } catch (err) {
      // Retry without gradient colors or icon if that caused a feature error
      try {
        const fallbackPayload = {
          name: srcRole.name.slice(0, 100),
          colors: { primaryColor },
          hoist: Boolean(srcRole.hoist),
          mentionable: Boolean(srcRole.mentionable),
          permissions: clampedPerms,
          reason: auditReason,
        };
        const created = await destGuild.roles.create(fallbackPayload);
        roleIdMap.set(srcRole.id, created.id);
        createdPairs.push({ sourcePos: srcRole.position || 0, role: created });
        createdRoles += 1;
      } catch (innerErr) {
        skipped.push(`Role @${srcRole.name} (${innerErr.message})`);
      }
    }
  }

  return {
    roleIdMap,
    deletedRoles,
    createdRoles,
    everyoneUpdated,
    skipped,
  };
}

/**
 * Builds fallback roleIdMap by matching destination role names when roles weren't newly created.
 */
function buildNameMatchedRoleMap(sourceGuild, destGuild) {
  const roleIdMap = new Map();
  roleIdMap.set(sourceGuild.id, destGuild.id);

  const sourceRoles = toArray(sourceGuild.roles?.cache);
  const destRoles = toArray(destGuild.roles?.cache);
  const destByName = new Map();
  for (const r of destRoles) {
    if (r && r.id !== destGuild.id) {
      destByName.set(r.name.toLowerCase(), r.id);
    }
  }

  for (const r of sourceRoles) {
    if (!r || r.id === sourceGuild.id) continue;
    const match = destByName.get(r.name.toLowerCase());
    if (match) roleIdMap.set(r.id, match);
  }
  return roleIdMap;
}

/**
 * Translates channel permission overwrites from source guild IDs to destination guild IDs.
 */
async function mapPermissionOverwrites(
  sourceChannel,
  sourceGuild,
  destGuild,
  roleIdMap,
  mePerms,
  memberExistsCache,
) {
  const overwritesRaw = toArray(sourceChannel.permissionOverwrites?.cache || sourceChannel.permissionOverwrites);
  const resolved = [];

  for (const ow of overwritesRaw) {
    if (!ow || !ow.id) continue;
    let targetId = null;

    if (ow.type === OverwriteType.Role || ow.type === 0 || ow.type === 'role') {
      if (ow.id === sourceGuild.id) {
        targetId = destGuild.id;
      } else {
        targetId = roleIdMap?.get(ow.id) || null;
      }
    } else if (ow.type === OverwriteType.Member || ow.type === 1 || ow.type === 'member') {
      if (memberExistsCache.has(ow.id)) {
        if (memberExistsCache.get(ow.id)) targetId = ow.id;
      } else {
        const cached = destGuild.members?.cache?.has?.(ow.id);
        let exists = Boolean(cached);
        if (!exists && typeof destGuild.members?.fetch === 'function') {
          const fetched = await destGuild.members.fetch(ow.id).catch(() => null);
          exists = Boolean(fetched);
        }
        memberExistsCache.set(ow.id, exists);
        if (exists) targetId = ow.id;
      }
    }

    if (!targetId) continue;

    const allow = clampPermissions(ow.allow?.bitfield ?? ow.allow ?? 0n, mePerms);
    const deny = clampPermissions(ow.deny?.bitfield ?? ow.deny ?? 0n, mePerms);
    if (allow.bitfield === 0n && deny.bitfield === 0n) continue;

    resolved.push({
      id: targetId,
      type: ow.type === 1 || ow.type === 'member' ? OverwriteType.Member : OverwriteType.Role,
      allow: allow.bitfield,
      deny: deny.bitfield,
    });
  }

  return resolved;
}

function getSortPos(ch) {
  return ch?.rawPosition ?? ch?.position ?? 0;
}

/**
 * Clones categories, text channels, voice channels & permission overwrites.
 */
async function cloneChannels(
  sourceGuild,
  destGuild,
  {
    textChannels = true,
    voiceChannels = true,
    rolePermissions = true,
    wipe = false,
    roleIdMap = null,
    protectChannelId = null,
    onProgress,
    reason,
  } = {},
) {
  const auditReason = reason || `Peace✘ /clone all from ${sourceGuild.name}`;
  const channelIdMap = new Map();
  const effectiveRoleMap = roleIdMap || buildNameMatchedRoleMap(sourceGuild, destGuild);

  const me =
    destGuild.members?.me ||
    (destGuild.members?.fetchMe ? await destGuild.members.fetchMe().catch(() => null) : null);
  const mePerms = me?.permissions || null;
  const memberExistsCache = new Map();

  const sourceChannelsRaw = sourceGuild.channels?.fetch
    ? await sourceGuild.channels.fetch().catch(() => sourceGuild.channels?.cache)
    : sourceGuild.channels?.cache;
  const destChannelsRaw = destGuild.channels?.fetch
    ? await destGuild.channels.fetch().catch(() => destGuild.channels?.cache)
    : destGuild.channels?.cache;

  const sourceChannels = toArray(sourceChannelsRaw).filter(
    (c) => c && (typeof c.isThread !== 'function' || !c.isThread()),
  );
  const destChannels = toArray(destChannelsRaw).filter(
    (c) => c && (typeof c.isThread !== 'function' || !c.isThread()),
  );

  let deletedChannels = 0;
  let createdCategories = 0;
  let createdTextChannels = 0;
  let createdVoiceChannels = 0;
  let firstTextChannel = null;
  const skipped = [];
  const converted = [];

  // 1. Delete existing channels if wipe is enabled (non-categories first, then categories)
  if (wipe) {
    await reportProgress(onProgress, 'Channels', 'Clearing existing channels...');
    const toDelete = [...destChannels].sort((a, b) => {
      const aIsCat = a.type === ChannelType.GuildCategory ? 1 : 0;
      const bIsCat = b.type === ChannelType.GuildCategory ? 1 : 0;
      return aIsCat - bIsCat;
    });

    for (const ch of toDelete) {
      if (!ch || ch.id === protectChannelId) continue;
      try {
        await ch.delete(auditReason);
        deletedChannels += 1;
      } catch (err) {
        skipped.push(`Delete #${ch.name} (${err.message})`);
      }
    }
  }

  if (!textChannels && !voiceChannels) {
    return {
      channelIdMap,
      deletedChannels,
      createdCategories,
      createdTextChannels,
      createdVoiceChannels,
      firstTextChannel,
      skipped,
      converted,
    };
  }

  const destFeatures = destGuild.features || [];
  const hasNews = destFeatures.includes('NEWS') || destFeatures.includes('COMMUNITY');
  const hasCommunity = destFeatures.includes('COMMUNITY');
  const maxBitrate = getTierMaxBitrate(destGuild);

  // 2. Determine which categories to clone (if both text & voice enabled, clone all categories;
  // if only one enabled, clone categories that have at least one enabled child OR are empty).
  const allCategories = sourceChannels
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => getSortPos(a) - getSortPos(b));

  const childrenByParent = new Map();
  for (const ch of sourceChannels) {
    if (ch.type === ChannelType.GuildCategory) continue;
    const pid = ch.parentId || '__root__';
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(ch);
  }

  const categoriesToCreate = allCategories.filter((cat) => {
    if (textChannels && voiceChannels) return true;
    const kids = childrenByParent.get(cat.id) || [];
    if (kids.length === 0) return true;
    return kids.some(
      (k) =>
        (textChannels && TEXT_LIKE_TYPES.has(k.type)) ||
        (voiceChannels && VOICE_LIKE_TYPES.has(k.type)),
    );
  });

  await reportProgress(
    onProgress,
    'Channels',
    `Creating categories (0/${categoriesToCreate.length})...`,
  );

  for (let i = 0; i < categoriesToCreate.length; i += 1) {
    const cat = categoriesToCreate[i];
    const overwrites = rolePermissions
      ? await mapPermissionOverwrites(cat, sourceGuild, destGuild, effectiveRoleMap, mePerms, memberExistsCache)
      : [];

    try {
      const created = await destGuild.channels.create({
        name: cat.name.slice(0, 100),
        type: ChannelType.GuildCategory,
        position: getSortPos(cat),
        ...(overwrites.length ? { permissionOverwrites: overwrites } : {}),
        reason: auditReason,
      });
      channelIdMap.set(cat.id, created.id);
      createdCategories += 1;
    } catch (err) {
      skipped.push(`Category ${cat.name} (${err.message})`);
    }
  }

  // 3. Collect enabled non-category channels sorted cleanly
  const textCandidates = textChannels
    ? sourceChannels
        .filter((c) => TEXT_LIKE_TYPES.has(c.type))
        .sort((a, b) => getSortPos(a) - getSortPos(b))
    : [];

  const voiceCandidates = voiceChannels
    ? sourceChannels
        .filter((c) => VOICE_LIKE_TYPES.has(c.type))
        .sort((a, b) => getSortPos(a) - getSortPos(b))
    : [];

  const channelsToCreate = [...textCandidates, ...voiceCandidates];

  for (let i = 0; i < channelsToCreate.length; i += 1) {
    const ch = channelsToCreate[i];
    if (i % 5 === 0) {
      await reportProgress(
        onProgress,
        'Channels',
        `Creating channels (${i + 1}/${channelsToCreate.length})...`,
      );
    }

    const overwrites = rolePermissions
      ? await mapPermissionOverwrites(ch, sourceGuild, destGuild, effectiveRoleMap, mePerms, memberExistsCache)
      : [];

    let targetType = ch.type;
    if (ch.type === ChannelType.GuildAnnouncement && !hasNews) {
      targetType = ChannelType.GuildText;
      converted.push(`#${ch.name}: Announcement → Text`);
    } else if ((ch.type === ChannelType.GuildForum || ch.type === ChannelType.GuildMedia) && !hasCommunity) {
      targetType = ChannelType.GuildText;
      converted.push(`#${ch.name}: Forum/Media → Text`);
    } else if (ch.type === ChannelType.GuildStageVoice && !hasCommunity) {
      targetType = ChannelType.GuildVoice;
      converted.push(`#${ch.name}: Stage → Voice`);
    }

    const parentId = ch.parentId ? channelIdMap.get(ch.parentId) || null : null;
    const isVoice = VOICE_LIKE_TYPES.has(targetType);

    const payload = {
      name: ch.name.slice(0, 100),
      type: targetType,
      ...(parentId ? { parent: parentId } : {}),
      position: getSortPos(ch),
      nsfw: Boolean(ch.nsfw),
      ...(overwrites.length ? { permissionOverwrites: overwrites } : {}),
      reason: auditReason,
    };

    if (isVoice) {
      const cap = targetType === ChannelType.GuildStageVoice ? 64000 : maxBitrate;
      const safeBitrate = Math.min(Math.max(ch.bitrate || 64000, 8000), cap);
      payload.bitrate = safeBitrate;
      if (typeof ch.userLimit === 'number') payload.userLimit = ch.userLimit;
      if (ch.rtcRegion) payload.rtcRegion = ch.rtcRegion;
      if (ch.videoQualityMode) payload.videoQualityMode = ch.videoQualityMode;
      if (typeof ch.rateLimitPerUser === 'number' && ch.rateLimitPerUser > 0) {
        payload.rateLimitPerUser = ch.rateLimitPerUser;
      }
    } else {
      if (ch.topic) payload.topic = String(ch.topic).slice(0, targetType === ChannelType.GuildForum ? 4096 : 1024);
      if (typeof ch.rateLimitPerUser === 'number') payload.rateLimitPerUser = ch.rateLimitPerUser;
      if (ch.defaultAutoArchiveDuration) payload.defaultAutoArchiveDuration = ch.defaultAutoArchiveDuration;
      if (targetType === ChannelType.GuildForum || targetType === ChannelType.GuildMedia) {
        if (typeof ch.defaultThreadRateLimitPerUser === 'number') {
          payload.defaultThreadRateLimitPerUser = ch.defaultThreadRateLimitPerUser;
        }
        if (Array.isArray(ch.availableTags) && ch.availableTags.length) {
          payload.availableTags = ch.availableTags.slice(0, 20).map((t) => ({
            name: t.name,
            moderated: Boolean(t.moderated),
            ...(t.emoji?.name && !t.emoji?.id ? { emoji: { name: t.emoji.name } } : {}),
          }));
        }
        if (ch.defaultSortOrder !== null && ch.defaultSortOrder !== undefined) {
          payload.defaultSortOrder = ch.defaultSortOrder;
        }
        if (ch.defaultForumLayout !== null && ch.defaultForumLayout !== undefined && targetType === ChannelType.GuildForum) {
          payload.defaultForumLayout = ch.defaultForumLayout;
        }
      }
    }

    try {
      const created = await destGuild.channels.create(payload);
      channelIdMap.set(ch.id, created.id);
      if (isVoice) {
        createdVoiceChannels += 1;
      } else {
        createdTextChannels += 1;
        if (
          !firstTextChannel &&
          created.type === ChannelType.GuildText &&
          (!me || !created.permissionsFor || created.permissionsFor(me)?.has?.(['ViewChannel', 'SendMessages']))
        ) {
          firstTextChannel = created;
        }
      }
    } catch (err) {
      // Retry without permissionOverwrites / extra forum metadata if channel creation was rejected by an attribute
      try {
        const minimalPayload = {
          name: ch.name.slice(0, 100),
          type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
          ...(parentId ? { parent: parentId } : {}),
          ...(isVoice ? { bitrate: Math.min(64000, maxBitrate) } : {}),
          reason: auditReason,
        };
        const created = await destGuild.channels.create(minimalPayload);
        channelIdMap.set(ch.id, created.id);
        if (isVoice) createdVoiceChannels += 1;
        else {
          createdTextChannels += 1;
          if (!firstTextChannel) firstTextChannel = created;
        }
        skipped.push(`#${ch.name} cloned with fallback settings (${err.message})`);
      } catch (innerErr) {
        skipped.push(`#${ch.name} (${innerErr.message})`);
      }
    }
  }

  return {
    channelIdMap,
    deletedChannels,
    createdCategories,
    createdTextChannels,
    createdVoiceChannels,
    firstTextChannel,
    skipped,
    converted,
  };
}

/**
 * Clones static emojis, animated GIF emojis, and stickers within Discord boost limits.
 */
async function cloneExpressions(sourceGuild, destGuild, { onProgress, reason } = {}) {
  const auditReason = reason || `Peace✘ /clone all from ${sourceGuild.name}`;

  const sourceEmojisRaw = sourceGuild.emojis?.fetch
    ? await sourceGuild.emojis.fetch().catch(() => sourceGuild.emojis?.cache)
    : sourceGuild.emojis?.cache;
  const sourceStickersRaw = sourceGuild.stickers?.fetch
    ? await sourceGuild.stickers.fetch().catch(() => sourceGuild.stickers?.cache)
    : sourceGuild.stickers?.cache;

  if (destGuild.emojis?.fetch) await destGuild.emojis.fetch().catch(() => {});
  if (destGuild.stickers?.fetch) await destGuild.stickers.fetch().catch(() => {});

  const emojis = toArray(sourceEmojisRaw);
  const stickers = toArray(sourceStickersRaw);

  const staticEmojis = emojis.filter((e) => !e.animated);
  const gifEmojis = emojis.filter((e) => e.animated);

  let copiedStatic = 0;
  let copiedGifs = 0;
  let copiedStickers = 0;
  const skipped = [];

  const perTypeCap = getEmojiSlotLimit(destGuild);
  let destStaticCount = toArray(destGuild.emojis?.cache).filter((e) => !e.animated).length;
  let destAnimatedCount = toArray(destGuild.emojis?.cache).filter((e) => e.animated).length;

  await reportProgress(
    onProgress,
    'Expressions',
    `Copying ${staticEmojis.length} emojis & ${gifEmojis.length} GIFs...`,
  );

  for (let i = 0; i < emojis.length; i += 1) {
    const emoji = emojis[i];
    if (i > 0 && i % 10 === 0) {
      await reportProgress(
        onProgress,
        'Expressions',
        `Copying emojis & GIFs (${i}/${emojis.length})...`,
      );
    }

    const isGif = Boolean(emoji.animated);
    if ((isGif ? destAnimatedCount : destStaticCount) >= perTypeCap) {
      skipped.push(`${isGif ? 'GIF' : 'Emoji'} :${emoji.name}: (slots full ${perTypeCap}/${perTypeCap})`);
      continue;
    }

    try {
      const url = emoji.imageURL({ size: 128, extension: isGif ? 'gif' : 'png' });
      await destGuild.emojis.create({
        attachment: url,
        name: cleanAssetName(emoji.name, 32, 'emoji'),
        reason: auditReason,
      });
      if (isGif) {
        destAnimatedCount += 1;
        copiedGifs += 1;
      } else {
        destStaticCount += 1;
        copiedStatic += 1;
      }
    } catch (err) {
      skipped.push(`${isGif ? 'GIF' : 'Emoji'} :${emoji.name}: (${err.message})`);
    }
  }

  if (stickers.length > 0) {
    await reportProgress(
      onProgress,
      'Stickers',
      `Copying ${stickers.length} sticker(s)...`,
    );
    const stickerCap = getStickerSlotLimit(destGuild);
    let currentStickers = toArray(destGuild.stickers?.cache).length;

    for (const sticker of stickers) {
      if (sticker.format === StickerFormatType.Lottie) {
        skipped.push(`Sticker ${sticker.name} (Lottie format cannot be uploaded by bots)`);
        continue;
      }
      if (currentStickers >= stickerCap) {
        skipped.push(`Sticker ${sticker.name} (sticker slots full ${stickerCap}/${stickerCap})`);
        continue;
      }

      const safeTags = String(sticker.tags || '').trim().slice(0, 200) || 'peacex';
      try {
        await destGuild.stickers.create({
          name: cleanAssetName(sticker.name, 30, 'sticker'),
          description: (sticker.description || 'Copied via Peace✘ /clone all').slice(0, 100),
          tags: safeTags,
          file: sticker.url,
          reason: auditReason,
        });
        currentStickers += 1;
        copiedStickers += 1;
      } catch (err) {
        // Fallback retry with safe ASCII tag if sticker.tags rejected
        try {
          await destGuild.stickers.create({
            name: cleanAssetName(sticker.name, 30, 'sticker'),
            description: (sticker.description || 'Copied via Peace✘ /clone all').slice(0, 100),
            tags: 'peacex',
            file: sticker.url,
            reason: auditReason,
          });
          currentStickers += 1;
          copiedStickers += 1;
        } catch (innerErr) {
          skipped.push(`Sticker ${sticker.name} (${innerErr.message})`);
        }
      }
    }
  }

  return {
    copiedStatic,
    totalStatic: staticEmojis.length,
    copiedGifs,
    totalGifs: gifEmojis.length,
    copiedStickers,
    totalStickers: stickers.length,
    copiedEmojis: copiedStatic + copiedGifs,
    totalEmojis: emojis.length,
    skipped,
  };
}

/**
 * Orchestrates full clone workflow for mode = 'server' | 'expressions' | 'both'.
 */
async function executeFullClone({
  sourceGuild,
  destinationGuild,
  mode = 'both',
  options = {},
  protectChannelId = null,
  onProgress,
  reason,
}) {
  const opts = {
    textChannels: options.textChannels !== false,
    voiceChannels: options.voiceChannels !== false,
    serverSettings: options.serverSettings !== false,
    rolePermissions: options.rolePermissions !== false,
    wipeExisting: Boolean(options.wipeExisting),
  };

  const runServer = mode === 'server' || mode === 'both';
  const runExpressions = mode === 'expressions' || mode === 'both';

  const summary = {
    mode,
    options: opts,
    settings: null,
    roles: null,
    channels: null,
    expressions: null,
  };

  if (runServer) {
    if (opts.serverSettings) {
      await reportProgress(onProgress, 'Server Settings', 'Applying server name, icon & security settings...');
      summary.settings = await cloneServerSettings(sourceGuild, destinationGuild, { phase: 1, reason });
    }

    let roleIdMap = null;
    if (opts.rolePermissions) {
      summary.roles = await cloneRolesAndPermissions(sourceGuild, destinationGuild, {
        wipe: opts.wipeExisting,
        onProgress,
        reason,
      });
      roleIdMap = summary.roles.roleIdMap;
    }

    if (opts.textChannels || opts.voiceChannels) {
      summary.channels = await cloneChannels(sourceGuild, destinationGuild, {
        textChannels: opts.textChannels,
        voiceChannels: opts.voiceChannels,
        rolePermissions: opts.rolePermissions,
        wipe: opts.wipeExisting,
        roleIdMap,
        protectChannelId,
        onProgress,
        reason,
      });
    }

    if (opts.serverSettings && summary.channels?.channelIdMap?.size) {
      const phase2 = await cloneServerSettings(sourceGuild, destinationGuild, {
        phase: 2,
        channelIdMap: summary.channels.channelIdMap,
        reason,
      });
      if (!summary.settings) summary.settings = { updated: [], skipped: [] };
      summary.settings.updated.push(...phase2.updated);
      summary.settings.skipped.push(...phase2.skipped);
    }
  }

  if (runExpressions) {
    summary.expressions = await cloneExpressions(sourceGuild, destinationGuild, {
      onProgress,
      reason,
    });
  }

  return summary;
}

module.exports = {
  EMOJI_SLOT_LIMITS,
  STICKER_SLOT_LIMITS,
  VOICE_MAX_BITRATE,
  TEXT_LIKE_TYPES,
  VOICE_LIKE_TYPES,
  toArray,
  cleanAssetName,
  clampPermissions,
  getTierMaxBitrate,
  getEmojiSlotLimit,
  getStickerSlotLimit,
  mapPermissionOverwrites,
  cloneServerSettings,
  cloneRolesAndPermissions,
  cloneChannels,
  cloneExpressions,
  executeFullClone,
};
