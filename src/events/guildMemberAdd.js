/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { get } = require('../utils/settings');
const { updateStats } = require('../utils/stats');
const { sendLog } = require('../utils/logging');
const { getCachedInvites, setCachedInvites } = require('../utils/inviteCache');

// ── Anti-raid handled by the security platform (Layer 5 fingerprinting +
//    Layer 7 playbooks) — see src/security/gateway.onMemberJoin. ────────────

module.exports = {
  name: 'guildMemberAdd',
  async execute(client, member) {
    const { successEmbed, errorEmbed } = require('../utils/decorations');
    const guild = member.guild;
    const config = get(guild.id, 'welcome') || {};

    // ── resolve the invite that was used (needed by anti-raid ctx) ────────
    const oldInvites = getCachedInvites(guild.id);
    const fetchedInvites = await guild.invites.fetch().catch(() => null);
    let usedInvite = null;
    const newInvites = new Map();

    if (fetchedInvites) {
      for (const invite of fetchedInvites.values()) {
        const uses = invite.uses || 0;
        newInvites.set(invite.code, uses);
        if (!usedInvite && uses > (oldInvites.get(invite.code) || 0)) {
          usedInvite = invite;
        }
      }
    }
    if (newInvites.size) setCachedInvites(guild.id, newInvites);

    // ── Security platform: anti-bot + anti-raid (zero-trust engine) ──────
    const security = client.security;
    if (security?.engine) {
      const gateway = require('../security/gateway');

      if (member.user.bot) {
        const sec = get(guild.id, 'security');
        if (sec.antiBot?.enabled) {
          const { isOwner } = require('../utils/owners');
          const bypass = isOwner(member.id, guild.id) || (sec.whitelist || []).includes(member.id);
          if (!bypass) {
            await member.kick('Peace✘ anti-bot: unauthorized bot addition').catch(() => {});
            const { errorEmbed: red } = require('../utils/decorations');
            const botEmbed = red({
              title: '🤖 Anti-Bot',
              description: `**${member.user.tag}** was kicked automatically (bot additions are not allowed).`,
            });
            await sendLog(client, guild.id, 'security', { embeds: [botEmbed] }).catch(() => {});
          }
        }
      } else {
        const raid = await gateway.onMemberJoin(client, member, { usedInvite });
        if (raid.escalated) {
          return;
        }
      }
    }

    // Legacy anti-raid fallback when the platform is not bootstrapped.
    if (member.user.bot === false && !security) {
      const sec = get(guild.id, 'security');
      if (sec.antiRaid?.enabled) {
        const now = Date.now();
        const windowMs = sec.antiRaid.windowMs || 10000;
        const list = (raidFallback.get(guild.id) || []).filter((ts) => now - ts < windowMs);
        list.push(now);
        raidFallback.set(guild.id, list);
        if (list.length >= (sec.antiRaid.maxJoins || 8)) {
          raidFallback.delete(guild.id);
        }
      }
    }

    // --- Automatic Dynamic Welcome DM ---
    const welcomeUtil = require('../utils/welcome');
    if (!member.user.bot) {
      const dmPayload = welcomeUtil.buildWelcomeDMPayload({ guild, member, config });
      if (dmPayload) {
        await member.send(dmPayload).catch(() => {});
      }
    }

    if (config.enabled !== false) {
      const welcomeChannel = welcomeUtil.resolveWelcomeChannel(guild, config);
      if (welcomeChannel) {
        let inviter = null;
        if (usedInvite) {
          inviter = usedInvite.inviter || (usedInvite.code ? `code \`${usedInvite.code}\`` : null);
        } else if (guild.vanityURLCode) {
          inviter = 'Vanity URL';
        }

        const payload = welcomeUtil.buildWelcomePayload({
          guild,
          member,
          inviter,
          config,
        });

        welcomeChannel.send(payload).catch((err) => {
          console.error(`[PeaceX] [Welcome] Could not send welcome message:`, err.message);
        });
        await sendLog(client, guild.id, 'welcome', payload).catch(() => {});
      }

      // Welcome role — correctly inside the config.enabled block
      if (config.roleId) {
        const role = guild.roles.cache.get(config.roleId);
        if (role) {
          try {
            await member.roles.add(role, 'Welcome role');
          } catch (err) {
            console.error(`[PeaceX] [Welcome] Could not assign role ${role.name}:`, err.message);
          }
        }
      }
    }

    // --- Autorole (owner-configured, independent of welcome messages) ---
    const autoroleId = get(guild.id, 'autorole').roleId;
    if (autoroleId) {
      const role = guild.roles.cache.get(autoroleId);
      if (role) {
        try {
          await member.roles.add(role, 'Autorole on join');
        } catch (err) {
          console.error(`[PeaceX] [Autorole] Could not assign role ${role.name}:`, err.message);
        }
      }
    }

    // --- Quarantined member rejoining: reapply the jail role ---
    const q = require('../utils/quarantine');
    if (q.isQuarantined(guild.id, member.id)) {
      const entry = q.getEntry(guild.id, member.id);
      const jailRole = entry?.roleId || q.getConfig(guild.id).roleId;
      if (jailRole && guild.roles.cache.get(jailRole)) {
        try {
          await member.roles.add(jailRole, 'Reapplied quarantine on rejoin');
        } catch (err) {
          console.error(`[PeaceX] [Quarantine] Could not reapply jail role:`, err.message);
        }
      }
    }

    const { getLogChannel } = require('../utils/logging');
    const { buildMemberJoinLog } = require('../utils/logFormatter');
    const entryEmbed = buildMemberJoinLog({
      member,
      usedInvite,
      vanityCode: guild.vanityURLCode,
    });

    const entryCh = await getLogChannel(client, guild.id, 'entry');
    const inviteCh = await getLogChannel(client, guild.id, 'invite');

    if (entryCh) {
      await entryCh.send({ embeds: [entryEmbed] }).catch(() => {});
    }
    if (inviteCh && inviteCh.id !== entryCh?.id) {
      await inviteCh.send({ embeds: [entryEmbed] }).catch(() => {});
    }
    await updateStats(client, guild);
  },
};

// Last-resort in-memory flood stub used only if the platform is not installed.
const raidFallback = new Map();
