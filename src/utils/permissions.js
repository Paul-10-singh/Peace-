/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Centralized 4-tier permission system — single source of truth.
 *   EVERYONE (1) -> no restriction
 *   ADMIN    (2) -> admin OR per-guild security-whitelisted member
 *   OWNER    (3) -> main OWNER_ID or users added via /owner add
 *   TRUSTED  (4) -> owner OR bot-wide trusted member (data/whitelist.json, /trusted)
 *
 * Commands not listed anywhere default to OWNER (tier 3).
 */
const { isOwner } = require('./owners');
const { isTrusted } = require('./whitelist');
const { getList } = require('./settings');

const TIERS = { EVERYONE: 1, ADMIN: 2, OWNER: 3, TRUSTED: 4 };

// Commands fully available to everyone (all subcommands if any).
const EVERYONE = new Set([
  // utility
  'help', 'all', 'ping', 'support', 'botinfo', 'avatar', 'serverinfo', 'userinfo', 'roles',
  'poll', 'remind', 'afk', 'todo', 'note', 'wallpaper',
  // music
  'play', 'spotify', 'fx', '24-7', 'connect',
  'skip', 'queue', 'volume', 'pause', 'resume', 'shuffle', 'history', '8d', 'booster', 'controls', 'mix', 'disconnect',
  'seek', 'autoplay', 'radio', 'playlist',
]);

// Commands gated by the server-specific whitelist (all subcommands if any).
const ADMIN = new Set([
  // moderation
  'timeout', 'untimeout', 'warn', 'warnings',
  // words / anti-words filters
  'words', 'antiwords',
  // anti-spam
  'antispam',
  // utility
  'lock', 'unlock', 'say', 'role',
]);

// Commands gated by the bot-wide trusted list (owner OR /trusted member) - all subcommands.
const TRUSTED = new Set([
  'autoreact', 'autoresponder',
  'kick', 'ban', 'timeout',
]);

// Commands whose subcommands are split across tiers.
// Missing subcommands fall back to the command's `default`.
const SUBCOMMANDS = {
  security: { default: TIERS.OWNER, status: TIERS.ADMIN },
  whitelist: { default: TIERS.OWNER, list: TIERS.ADMIN },
  ignore: { default: TIERS.OWNER, list: TIERS.ADMIN },
};

function getCommandTier(command, sub = null) {
  const entry = SUBCOMMANDS[command];
  if (entry) {
    if (sub && entry[sub] !== undefined) return entry[sub];
    return entry.default;
  }
  if (EVERYONE.has(command)) return TIERS.EVERYONE;
  if (TRUSTED.has(command)) return TIERS.TRUSTED;
  if (ADMIN.has(command)) return TIERS.ADMIN;
  return TIERS.OWNER;
}

// user = { id } | interaction.user, guild = Guild | null (DMs have no whitelist)
function hasAccess(user, guild, command, sub = null) {
  const tier = getCommandTier(command, sub);
  if (tier === TIERS.EVERYONE) return true;
  if (isOwner(user.id, guild?.id)) return true;
  if (tier === TIERS.TRUSTED) {
    return !!(guild && isTrusted(user.id, guild.id));
  }
  if (tier === TIERS.ADMIN && guild) {
    return getList(guild.id, 'security', 'whitelist').includes(user.id);
  }
  return false;
}

// True if the user can run at least one subcommand of an interactive command.
function canRunAny(user, guild, command) {
  if (hasAccess(user, guild, command.data.name)) return true;
  const json = command.data.toJSON();
  const subs = (json.options || []).filter((o) => o.type === 1).map((o) => o.name);
  return subs.some((sub) => hasAccess(user, guild, command.data.name, sub));
}

module.exports = { TIERS, getCommandTier, hasAccess, canRunAny };