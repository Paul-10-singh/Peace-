/*
 * Peace✘ - Deployment exclusions.
 *
 * Discord caps GLOBAL commands at 100. This list (16 entries) is withheld
 * from deployment to keep the registered set under the cap while /refresh
 * and the panel / help commands stay live.
 *
 * Merges already removed separate top-level commands:
 *  - /purge user + /purge all + /purge bot  (old purge_user, purge_all_server_user, purgebots)
 *  - /warn add + /warn list + /warn remove (old warnings, unwarn)
 *  - /backup structure + /backup files     (old backupfiles)
 * New: /antibot, /antiraid (security panels), /clone all.
 * Un-excluded: /vc (already has the requested subcommands), /backup (merged).
 * Note: all music commands moved to the separate "Peace music" bot.
 *
 * To deploy a different command instead, just edit this array (keep exactly
 * the count you need — deploy.js verifies the final count is <= 100).
 */
const EXCLUDED_COMMANDS = [
  // legacy / rarely-used owner tools
  'picture',
  'removeroll',
  'removerollall',
  'snipe',
  'thread',
  'media',
  'mention',
  'addrole',     // duplicate of addroleall
  'channel',
  'serverlist',
  'botinfo',
  'setprofile',
  'leaveserver',
  // niche utility commands
  'roleicon',
  'say',
  'lock',
];

function isCommandExcluded(name) {
  return EXCLUDED_COMMANDS.includes(name);
}

module.exports = { EXCLUDED_COMMANDS, isCommandExcluded };