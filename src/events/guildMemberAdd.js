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
    const config = get(guild.id, 'welcome');

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

    // --- Automatic Welcome DM ---
    if (!member.user.bot) {
      const dmWelcomeMessage = `_ _
⠀⠀   𓈒  <a:nature:1552099429362962452> 𓂃  /[** TNC Official__   __**](https://discord.gg/far7wH9fmP)   ﹑   \` 🤍 \`⠀⠀⠀
-# _ _⠀     ⠀𐔌  ᗢ⠀⠀ch__ill__ & v*c*⠀𖦹⠀**social**⠀﹒﹢   ꒱꒱
-# _ _    ⠀ ⠀     ⠀ꕀ⠀⠀__anime__⠀join__**2**__create **!**
-# _ _ ✦﹒﹢⠀⠀de__v__⠀⸝⸝⠀**events**⠀⸝⸝ ⠀<a:gaming:1552099352158150706> g*aming*⠀<a:music:1550504904521678848>
-# _ _ [** rules__   __**](https://discord.com/channels/1340379968571576341/1341663035017793647)  [** chat__   __**](https://discord.com/channels/1340379968571576341/1501972344179261611)  [** support__   __**](https://discord.com/channels/1340379968571576341/1551092438460801064)
-# _ _ 
-#          <a:LIKEBUTTON:1550504896745181234> Welcome to TNC™
-#         \`hope you enjoy your stay !\`
-# _ _                    𝝑ৎ`;

      const { EmbedBuilder } = require('discord.js');
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setDescription(dmWelcomeMessage);

      await member.send({ embeds: [dmEmbed] }).catch(() => {});
    }

    if (config.enabled) {
      const channel = guild.channels.cache.get(config.channelId);
      if (channel?.isTextBased()) {
        const embed = successEmbed({
          title: `Welcome to ${guild.name}!`,
          description: (config.message || 'Welcome {user} to {server}!')
            .replace('{user}', `<@${member.id}>`)
            .replace('{server}', guild.name),
          thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
          extra: `Member #${guild.memberCount}`,
        });

        channel.send({ embeds: [embed] }).catch(() => {});
        await sendLog(client, guild.id, 'welcome', { embeds: [embed] });
      }

      // Welcome role — correctly inside the config.enabled block
      if (config.roleId) {
        const role = guild.roles.cache.get(config.roleId);
        if (role) {
          try {
            await member.roles.add(role);
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

    const inviteEmbed = successEmbed({
      title: 'Member Joined',
      description: `${member.user.username} (<@${member.id}>) joined the server.`,
      fields: [
        { name: 'Member', value: `<@${member.id}>`, inline: true },
        { name: 'Invited by', value: usedInvite ? `${usedInvite.inviter?.username || 'Unknown'} (code ${usedInvite.code})` : 'Unknown', inline: true },
      ],
      extra: `Member #${guild.memberCount}`,
    });

    await sendLog(client, guild.id, 'invite', { embeds: [inviteEmbed] });
    await updateStats(client, guild);
  },
};

// Last-resort in-memory flood stub used only if the platform is not installed.
const raidFallback = new Map();