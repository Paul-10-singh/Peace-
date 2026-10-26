/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Reusable access-control check for restricted commands.
 *   - isOwnerOrTrusted(userId): owner (OWNER_ID env or data/owners.json)
 *     OR bot-wide trusted member (data/whitelist.json, managed via /trusted).
 *   - requireAccess({ level })(handler): wraps a command execute callback;
 *     denies with an ephemeral message on failure.
 *
 * Apply to any future restricted command:
 *   execute: requireAccess()(async (interaction, client) => { ... }),
 *   execute: requireAccess({ level: 'owner' })(async (interaction) => { ... }),
 *   execute: requireAccess({ level: 'botOwner' })(async (interaction) => { ... }),
 */
const { MessageFlags } = require('discord.js');
const { isOwner, isBotOwner } = require('./owners');
const whitelist = require('./whitelist');

const LEVELS = { BOT_OWNER: 'botOwner', OWNER: 'owner', TRUSTED: 'trusted' };

const DENIED_MESSAGE = "<a:wrong:1550504971303395430> You don't have permission to use this command.";
const BOT_OWNER_DENIED = '<a:wrong:1550504971303395430> This command is strictly reserved for the **Bot Owner**.';

// Owner OR bot-wide trusted member.
function isOwnerOrTrusted(userId, guildId, guild = null) {
  return isOwner(userId, guildId, guild) || whitelist.isTrusted(userId, guildId);
}

// Middleware factory. level 'trusted' (default) = owners + trusted members;
// level 'owner' = owners only; level 'botOwner' = global bot owner only.
function requireAccess({ level = LEVELS.TRUSTED } = {}) {
  return (handler) =>
    async function guardedExecute(interaction, client) {
      if (level === LEVELS.BOT_OWNER || level === 'botOwner') {
        if (!isBotOwner(interaction.user.id)) {
          return interaction.reply({ content: BOT_OWNER_DENIED, flags: MessageFlags.Ephemeral });
        }
        return handler(interaction, client);
      }

      const allowed = level === LEVELS.OWNER
        ? isOwner(interaction.user.id, interaction.guild?.id, interaction.guild)
        : isOwnerOrTrusted(interaction.user.id, interaction.guild?.id, interaction.guild);
      if (!allowed) {
        return interaction.reply({ content: DENIED_MESSAGE, flags: MessageFlags.Ephemeral });
      }
      return handler(interaction, client);
    };
}

module.exports = { LEVELS, DENIED_MESSAGE, BOT_OWNER_DENIED, isOwnerOrTrusted, requireAccess };
