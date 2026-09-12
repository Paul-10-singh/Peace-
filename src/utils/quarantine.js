/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Quarantine (jail) system helpers. Data lives in per-guild settings:
 *   quarantine: { roleId, bypass: [], users: { [userId]: { until, roles, by } } }
 * "roles" = the role IDs that were stripped from the user (restored on release).
 */
const settings = require('./settings');

function getConfig(guildId) {
  return settings.get(guildId, 'quarantine');
}

function save(guildId, config) {
  settings.set(guildId, 'quarantine', config);
}

function isQuarantined(guildId, userId) {
  const config = getConfig(guildId);
  return Object.prototype.hasOwnProperty.call(config.users, userId);
}

function isBypassed(guildId, member) {
  const config = getConfig(guildId);
  if (!Array.isArray(config.bypass) || !config.bypass.length) return false;
  return config.bypass.some((roleId) => member.roles?.cache?.has(roleId));
}

function quarantine(guildId, userId, roleId, roles, by, untilMs = null) {
  const config = getConfig(guildId);
  config.users = config.users || {};
  config.users[userId] = { roleId, until: untilMs, roles: roles || [], by };
  save(guildId, config);
}

function release(guildId, userId) {
  const config = getConfig(guildId);
  if (!config.users) return null;
  const entry = config.users[userId];
  if (!entry) return null;
  delete config.users[userId];
  save(guildId, config);
  return entry;
}

function getEntry(guildId, userId) {
  return getConfig(guildId).users?.[userId] || null;
}

// Fully release a quarantined member: restore their roles, remove the jail
// role and clear the record. Returns the released entry, or null.
async function releaseMember(guild, userId, reason = 'Quarantine lifted') {
  const entry = release(guild.id, userId);
  if (!entry) return null;
  try {
    const member = await guild.members.fetch(userId);
    await member.roles.remove(entry.roleId || getConfig(guild.id).roleId, reason).catch(() => {});
    const toRestore = (entry.roles || []).filter((id) => member.roles.cache.has(id) === false);
    if (toRestore.length) await member.roles.add(toRestore, reason).catch(() => {});
  } catch {}
  return entry;
}

module.exports = { getConfig, save, isQuarantined, isBypassed, quarantine, release, getEntry, releaseMember };