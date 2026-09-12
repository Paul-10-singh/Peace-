/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const invites = new Map();

async function refreshGuildInvites(guild) {
  if (!guild || !guild.available) return null;
  const fetched = await guild.invites.fetch().catch(() => null);
  if (!fetched) return null;

  const inviteMap = new Map();
  for (const invite of fetched.values()) {
    inviteMap.set(invite.code, invite.uses || 0);
  }

  invites.set(guild.id, inviteMap);
  return inviteMap;
}

async function init(client) {
  for (const guild of client.guilds.cache.values()) {
    await refreshGuildInvites(guild);
  }
}

function getCachedInvites(guildId) {
  return invites.get(guildId) || new Map();
}

function setCachedInvites(guildId, inviteMap) {
  invites.set(guildId, inviteMap);
}

module.exports = { init, refreshGuildInvites, getCachedInvites, setCachedInvites };
