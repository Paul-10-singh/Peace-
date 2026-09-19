/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Reusable access-control check for restricted commands.
 *   - isOwnerOrTrusted(userId): owner (OWNER_ID env or data/owners.json)
 *     OR bot-wide trusted member (data/whitelist.json, managed via /trusted).
 *   - requireAccess({ level })(handler): wraps a command execute callback;
 *     denies with a generic ephemeral message on failure.
 *     Never reveals who is trusted/whitelisted.
 *
 * Apply to any future restricted command:
 *   execute: requireAccess()(async (interaction, client) => { ... }),
 *   execute: requireAccess({ level: 'owner' })(async (interaction) => { ... }),
 */
const { MessageFlags } = require('discord.js');
const { isOwner } = require('./owners');
const whitelist = require('./whitelist');

const LEVELS = { OWNER: 'owner', TRUSTED: 'trusted' };

const DENIED_MESSAGE = "<a:wrong:1550504971303395430> You don't have permission to use this command.";

// Owner OR bot-wide trusted member.
function isOwnerOrTrusted(userId, guildId) {
  return isOwner(userId, guildId) || whitelist.isTrusted(userId, guildId);
}

// Middleware factory. level 'trusted' (default) = owners + trusted members;
// level 'owner' = owners only. Returns a wrapped execute(interaction, client).
function requireAccess({ level = LEVELS.TRUSTED } = {}) {
  return (handler) =>
    async function guardedExecute(interaction, client) {
      const allowed = level === LEVELS.OWNER
        ? isOwner(interaction.user.id, interaction.guild?.id)
        : isOwnerOrTrusted(interaction.user.id, interaction.guild?.id);
      if (!allowed) {
        return interaction.reply({ content: DENIED_MESSAGE, flags: MessageFlags.Ephemeral });
      }
      return handler(interaction, client);
    };
}

module.exports = { LEVELS, DENIED_MESSAGE, isOwnerOrTrusted, requireAccess };
