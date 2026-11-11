/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * guildCreate / guildDelete —
 *   1. Sends sleek Components V2 welcome/departure cards to the Server Owner & system channel.
 *   2. Sends detailed Server Join Telemetry Log (identification, member census, permanent invite,
 *      audit log adder, timestamps & quick invite button) directly to the Bot Owner's DM.
 */
const {
  AuditLogEvent,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { getBotOwnerIds } = require('../utils/owners');

const EMOJI_SQ = '<a:sq:1552095567759417477>';
const DEFAULT_SUPPORT_URL = 'https://discord.gg/GUyMU2YcxJ';

// Support server invite (optional — override via SUPPORT_URL in .env)
function supportUrl() {
  return process.env.SUPPORT_URL || DEFAULT_SUPPORT_URL;
}

function inviteUrl(client) {
  const appId = client?.user?.id || process.env.CLIENT_ID;
  if (!appId) return null;
  return `https://discord.com/oauth2/authorize?client_id=${appId}&permissions=8&scope=bot%20applications.commands`;
}

function safeGuildName(guild) {
  const raw = String(guild?.name || '').trim();
  return raw || 'Unnamed Server';
}

function buildWelcomeContainer({ client, guild, owner }) {
  const botName = client?.user?.username || 'Peace✘';
  const ownerName = owner?.globalName || owner?.displayName || owner?.username || 'there';
  const guildName = safeGuildName(guild);

  const thumbUrl =
    guild?.iconURL?.({ extension: 'png', size: 256 }) ||
    client?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) ||
    null;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${EMOJI_SQ}  **Hey ${ownerName} , I am ${botName}!**`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

  const bodyContent = [
    `> ${EMOJI_SQ}  **Thanks for adding me to ${guildName}!**`,
    `> ${EMOJI_SQ}  **Type \`/help\` to dive in.**`,
    `> ${EMOJI_SQ}  **Fully equipped: Antinuke  •  Music  •  Security & more.**`,
  ].join('\n');

  if (thumbUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyContent))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl))
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyContent));
  }

  const buttons = [];
  const inv = inviteUrl(client);
  if (inv) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Invite Bot')
        .setURL(inv)
        .setStyle(ButtonStyle.Link)
    );
  }
  const sup = supportUrl();
  if (sup) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Support Server')
        .setURL(sup)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (buttons.length) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${botName}  •  Multipurpose  •  Security & Utility`)
    );

  return container;
}

function buildDepartureContainer({ client, guild, reason = null }) {
  const botName = client?.user?.username || 'Peace✘';
  const guildName = safeGuildName(guild);
  const leftTs = Math.floor(Date.now() / 1000);

  const infoLines = [
    `${botName} has been removed from **${guildName}**.`,
    '',
    `> ${EMOJI_SQ}  **Removed:** <t:${leftTs}:R>`,
  ];
  if (reason) {
    infoLines.push(`> ${EMOJI_SQ}  **Reason:** ${reason}`);
  }
  infoLines.push(
    '',
    `*Thank you for trying ${botName}. If you experienced any issue or would like to share feedback, you may reach out in our official support server.*`
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${EMOJI_SQ}  **${botName} — Departure Notice**`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(infoLines.join('\n'))
    );

  const buttons = [];
  const sup = supportUrl();
  if (sup) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Support Server')
        .setURL(sup)
        .setStyle(ButtonStyle.Link)
    );
  }
  const inv = inviteUrl(client);
  if (inv) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Add Me Back')
        .setURL(inv)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (buttons.length) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${botName}  —  Automated Security & Utility`)
    );

  return container;
}

/**
 * Computes member census (total, humans, bots, bot %) for a guild.
 */
async function collectMemberCensus(guild) {
  if (guild?.members?.fetch && (guild.memberCount || 0) <= 5000) {
    await guild.members.fetch({ time: 5000 }).catch(() => null);
  }

  const cached = guild?.members?.cache
    ? typeof guild.members.cache.values === 'function'
      ? [...guild.members.cache.values()]
      : Object.values(guild.members.cache)
    : [];

  const total = guild?.memberCount ?? cached.length ?? 0;
  const bots = cached.filter((m) => Boolean(m?.user?.bot)).length;
  const cachedHumans = cached.filter((m) => m?.user && !m.user.bot).length;
  const humans =
    total > 0 && cached.length >= total * 0.9
      ? Math.max(0, total - bots)
      : cached.length > 0
        ? cachedHumans
        : total;

  const denom = total > 0 ? total : humans + bots;
  const botPct = denom > 0 ? ((bots / denom) * 100).toFixed(1) : '0.0';

  return { total, humans, bots, botPct };
}

/**
 * Finds who added the bot to the guild via Audit Log (AuditLogEvent.BotAdd).
 */
async function resolveAddedBy(client, guild, me) {
  try {
    const canAudit = Boolean(
      me?.permissions?.has?.(PermissionFlagsBits.ViewAuditLog) ||
      me?.permissions?.has?.(PermissionFlagsBits.Administrator),
    );
    if (!canAudit || typeof guild?.fetchAuditLogs !== 'function') {
      return { user: null, reason: 'No Audit Log Perm' };
    }

    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 }).catch(() => null);
    const entries = logs?.entries
      ? typeof logs.entries.values === 'function'
        ? [...logs.entries.values()]
        : Object.values(logs.entries)
      : [];

    const botId = client?.user?.id;
    const match =
      entries.find(
        (e) =>
          (!botId || e.targetId === botId || e.target?.id === botId) &&
          (!e.createdTimestamp || Date.now() - e.createdTimestamp < 180_000),
      ) ||
      entries.find((e) => !botId || e.targetId === botId || e.target?.id === botId);

    return { user: match?.executor || null, reason: match?.executor ? null : 'Not Found' };
  } catch {
    return { user: null, reason: 'Unavailable' };
  }
}

/**
 * Resolves or creates a permanent server invite URL safely.
 */
async function resolvePermanentInvite(guild, me) {
  if (!guild) return null;
  if (guild.vanityURLCode) {
    return `https://discord.gg/${guild.vanityURLCode}`;
  }

  try {
    const canManage = Boolean(
      me?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
      me?.permissions?.has?.(PermissionFlagsBits.Administrator),
    );
    if (canManage && typeof guild.invites?.fetch === 'function') {
      const existing = await guild.invites.fetch().catch(() => null);
      const list = existing
        ? typeof existing.values === 'function'
          ? [...existing.values()]
          : Object.values(existing)
        : [];
      const permInv = list.find(
        (i) => i && i.maxAge === 0 && (!i.maxUses || i.maxUses === 0) && !i.temporary,
      );
      if (permInv?.url || permInv?.code) {
        return permInv.url || `https://discord.gg/${permInv.code}`;
      }
    }
  } catch {
    // Continue to invite creation fallback
  }

  try {
    const rawChannels = guild.channels?.cache;
    const channels = rawChannels
      ? typeof rawChannels.values === 'function'
        ? [...rawChannels.values()]
        : Object.values(rawChannels)
      : [];

    const canInviteIn = (ch) =>
      ch &&
      ch.isTextBased?.() &&
      !ch.isVoiceBased?.() &&
      (!ch.isThread || !ch.isThread()) &&
      typeof ch.createInvite === 'function' &&
      me &&
      ch.permissionsFor?.(me)?.has?.([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.CreateInstantInvite,
      ]);

    const preferred =
      (canInviteIn(guild.rulesChannel) ? guild.rulesChannel : null) ||
      (canInviteIn(guild.systemChannel) ? guild.systemChannel : null) ||
      channels.find(canInviteIn) ||
      null;

    if (preferred) {
      const inv = await preferred
        .createInvite({
          maxAge: 0,
          maxUses: 0,
          unique: false,
        })
        .catch(() => null);
      if (inv?.url || inv?.code) {
        return inv.url || `https://discord.gg/${inv.code}`;
      }
    }
  } catch {
    // Ignore invite creation failures
  }

  return null;
}

/**
 * Collects all telemetry details for the Bot Owner DM notification on guildCreate.
 */
async function collectGuildJoinTelemetry({ client, guild, owner = null }) {
  const me = guild?.members?.me || (await guild?.members?.fetchMe?.().catch(() => null));
  const [census, addedByInfo, permanentInvite] = await Promise.all([
    collectMemberCensus(guild),
    resolveAddedBy(client, guild, me),
    resolvePermanentInvite(guild, me),
  ]);

  const hasAdmin = Boolean(me?.permissions?.has?.(PermissionFlagsBits.Administrator));
  const channelsCount = guild?.channels?.cache?.size ?? 0;
  const rolesCount = guild?.roles?.cache?.size ?? 0;

  return {
    client,
    guild,
    owner,
    addedBy: addedByInfo.user,
    addedByFallback: addedByInfo.reason,
    census,
    hasAdmin,
    channelsCount,
    rolesCount,
    permanentInvite,
    joinedTimestamp: Math.floor(Date.now() / 1000),
  };
}

/**
 * Builds the sleek Components V2 Server Join Telemetry card for Bot Owner DMs,
 * matching the Server Identification + Census & Telemetry + Join Details & Access layout.
 */
function buildOwnerJoinTelemetryContainer({
  client,
  guild,
  owner = null,
  addedBy = null,
  addedByFallback = 'Unknown',
  census = { total: 0, humans: 0, bots: 0, botPct: '0.0' },
  hasAdmin = false,
  channelsCount = 0,
  rolesCount = 0,
  permanentInvite = null,
  joinedTimestamp = Math.floor(Date.now() / 1000),
}) {
  const botName = client?.user?.username || 'Peace✘';
  const guildName = safeGuildName(guild);

  const ownerId = owner?.id || guild?.ownerId || null;
  const ownerDisplay = ownerId ? `<@${ownerId}> (\`${ownerId}\`)` : '`Unknown`';
  const adderDisplay = addedBy?.id
    ? `<@${addedBy.id}> (\`${addedBy.id}\`)`
    : `\`${addedByFallback || 'Unknown'}\``;

  const thumbUrl =
    guild?.iconURL?.({ extension: 'png', size: 256 }) ||
    client?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) ||
    null;

  const isBotHeavy = census.total >= 5 && census.bots > census.humans;
  const safetyLabel = isBotHeavy
    ? `⚠️ High Bot Ratio (${census.botPct}%)`
    : 'Clean Member Ratio';
  const permLabel = hasAdmin ? 'Administrator' : 'Standard Permissions';

  const identificationText = [
    '**Server Identification**',
    `> • Server Name: **${guildName}**`,
    `> • Server ID: \`${guild?.id || 'Unknown'}\``,
    `> • Server Owner: ${ownerDisplay}`,
    `> • Added By: ${adderDisplay}`,
  ].join('\n');

  const censusText = [
    '**Census & Telemetry**',
    `> • Total Members: \`${census.total}\``,
    `> • Humans vs Bots: \`${census.humans}\` Humans • \`${census.bots}\` Bots (\`${census.botPct}%\` Bots)`,
    `> • Access & Safety: \`${permLabel}\` • \`${safetyLabel}\``,
  ].join('\n');

  const inviteLine = permanentInvite
    ? `[Click to Join](${permanentInvite}) • \`${permanentInvite}\``
    : '`Unavailable (Missing Invite Permission)`';

  const boostTier = guild?.premiumTier ?? 0;
  const joinDetailsText = [
    '**Join Details & Access**',
    `> • Summary: Added to **${guildName}** (Boost Tier \`${boostTier}\` • Channels: \`${channelsCount}\` • Roles: \`${rolesCount}\`)`,
    `> • Permanent Invite: ${inviteLine}`,
    `> • Timestamp: <t:${joinedTimestamp}:F> (<t:${joinedTimestamp}:R>)`,
  ].join('\n');

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${EMOJI_SQ} Server Join Telemetry Log`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    );

  if (thumbUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(identificationText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl))
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(identificationText)
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(censusText))
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(joinDetailsText));

  if (permanentInvite) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Server Invite Link')
          .setURL(permanentInvite)
          .setStyle(ButtonStyle.Link)
      )
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${botName} — Server Telemetry Protocol`)
    );

  return container;
}

module.exports = {
  EMOJI_SQ,
  buildWelcomeContainer,
  buildDepartureContainer,
  buildOwnerJoinTelemetryContainer,
  collectMemberCensus,
  resolveAddedBy,
  resolvePermanentInvite,
  collectGuildJoinTelemetry,
  events: {
    // ── Bot added to a server ──────────────────────────────────────────────
    async guildCreate(client, guild) {
      // Fetch full guild data (owner may not be cached yet)
      const fullGuild = await guild.fetch().catch(() => guild);
      const owner = fullGuild.ownerId
        ? await client.users.fetch(fullGuild.ownerId).catch(() => null)
        : null;

      // 1. Send Server Owner + Channel Welcome Card
      const container = buildWelcomeContainer({ client, guild: fullGuild, owner });
      const payload = {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      };

      if (owner) {
        await owner.send(payload).catch(() => {
          // DMs may be closed — silently ignore
        });
      }

      // Also drop the welcome card into the server's system channel (or the
      // first text channel we can post in), if any.
      const me = fullGuild.members?.me || (await fullGuild.members?.fetchMe?.().catch(() => null));
      const canPost = (c) =>
        c?.isTextBased?.() &&
        !c.isVoiceBased?.() &&
        me &&
        c.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);

      const channel =
        (canPost(fullGuild.systemChannel) ? fullGuild.systemChannel : null) ||
        fullGuild.channels?.cache?.filter(canPost)?.first?.();

      if (channel) {
        await channel.send(payload).catch(() => {});
      }

      // 2. Send Private Server Join Telemetry Log DM to the Bot Owner(s)
      const botOwnerIds = getBotOwnerIds();
      if (botOwnerIds.length > 0) {
        const telemetry = await collectGuildJoinTelemetry({ client, guild: fullGuild, owner });
        const telemetryContainer = buildOwnerJoinTelemetryContainer(telemetry);
        const telemetryPayload = {
          components: [telemetryContainer],
          flags: MessageFlags.IsComponentsV2,
        };

        for (const botOwnerId of botOwnerIds) {
          const botOwner = await client.users.fetch(botOwnerId).catch(() => null);
          if (botOwner) {
            await botOwner.send(telemetryPayload).catch(() => {});
          }
        }
      }
    },

    // ── Bot removed from a server ─────────────────────────────────────────
    async guildDelete(client, guild) {
      // guild.ownerId may still be available from cache
      if (!guild?.ownerId) return;
      const owner = await client.users.fetch(guild.ownerId).catch(() => null);
      if (!owner) return;

      const container = buildDepartureContainer({ client, guild });
      await owner
        .send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    },
  },
};
