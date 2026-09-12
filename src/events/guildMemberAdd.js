/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { get } = require('../utils/settings');
const { updateStats } = require('../utils/stats');
const { sendLog } = require('../utils/logging');
const { getCachedInvites, setCachedInvites } = require('../utils/inviteCache');

module.exports = {
  name: 'guildMemberAdd',
  async execute(client, member) {
    const { successEmbed } = require('../utils/decorations');
    const guild = member.guild;
    const config = get(guild.id, 'welcome');

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
