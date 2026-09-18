/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { get } = require('../utils/settings');
const { updateStats } = require('../utils/stats');
const { sendLog } = require('../utils/logging');
const { getCachedInvites, setCachedInvites } = require('../utils/inviteCache');

// guildId -> recent join timestamps (used by anti-raid flood detection)
const raidJoins = new Map();

// Anti-raid trigger: lock every text channel for 10 minutes, then auto-unlock.
async function lockTextChannels(client, guild) {
  let locked = 0;
  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased()) {
      await channel.permissionOverwrites
        .edit(guild.id, { SendMessages: false }, { reason: 'Peace✘ anti-raid lockdown' })
        .catch(() => {});
      locked += 1;
    }
  }
  const { errorEmbed } = require('../utils/decorations');
  const embed = errorEmbed({
    title: '🚨 ANTI-RAID',
    description: `Join flood detected — **${locked}** text channel(s) locked for 10 minutes.`,
  });
  await sendLog(client, guild.id, 'security', { embeds: [embed] }).catch(() => {});
  setTimeout(async () => {
    for (const channel of guild.channels.cache.values()) {
      if (channel.isTextBased()) {
        await channel.permissionOverwrites
          .edit(guild.id, { SendMessages: null }, { reason: 'Peace✘ anti-raid lockdown lifted' })
          .catch(() => {});
      }
    }
  }, 10 * 60 * 1000);
}

module.exports = {
  name: 'guildMemberAdd',
  async execute(client, member) {
    const { successEmbed } = require('../utils/decorations');
    const guild = member.guild;
    const config = get(guild.id, 'welcome');

    // ── Anti-bot: kick unauthorized bot additions ─────────────────────
    if (member.user.bot) {
      const sec = get(guild.id, 'security');
      if (sec.antiBot?.enabled) {
        const { isOwner } = require('../utils/owners');
        const bypass = isOwner(member.id, guild.id) || (sec.whitelist || []).includes(member.id);
        if (!bypass) {
          await member.kick('Peace✘ anti-bot: unauthorized bot addition').catch(() => {});
          const { errorEmbed } = require('../utils/decorations');
          const botEmbed = errorEmbed({
            title: '🤖 Anti-Bot',
            description: `**${member.user.tag}** was kicked automatically (bot additions are not allowed).`,
          });
          await sendLog(client, guild.id, 'security', { embeds: [botEmbed] }).catch(() => {});
        }
      }
    }

    // ── Anti-raid: detect sudden join floods and lock the server ──────
    const sec = get(guild.id, 'security');
    if (sec.antiRaid?.enabled) {
      const now = Date.now();
      const windowMs = sec.antiRaid.windowMs || 10000;
      const list = (raidJoins.get(guild.id) || []).filter((t) => now - t < windowMs);
      list.push(now);
      raidJoins.set(guild.id, list);
      if (list.length >= (sec.antiRaid.maxJoins || 8)) {
        raidJoins.delete(guild.id);
        await lockTextChannels(client, guild);
      }
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

    if (newInvites.size) {
      setCachedInvites(guild.id, newInvites);
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
