/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /noprefix - manage users who can run commands with the `n <command>`
 * message prefix instead of slash commands (e.g. `n play`, `n help`, `n say`).
 * Owners only. Stored in data/noprefix.json and survives restarts.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, successEmbed, warningEmbed } = require('../../utils/decorations');
const { requireAccess } = require('../../utils/access');
const noprefix = require('../../utils/noprefix');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('noprefix')
    .setDescription('Manage users allowed to use the "n <command>" message prefix (owners only)')
    .addSubcommand((s) => s.setName('add').setDescription('Grant a user the "n <command>" prefix privilege')
      .addUserOption((o) => o.setName('user').setDescription('The user to grant').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Revoke a user\'s "n <command>" privilege')
      .addUserOption((o) => o.setName('user').setDescription('The user to revoke').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show all no-prefix users (owner only)')),
  execute: requireAccess({ level: 'owner' })(async (interaction) => {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const ids = noprefix.getNoprefixUsers();
      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: '⌨️ No-prefix users',
            description: ids.length
              ? ids.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n')
              : 'No users granted the no-prefix privilege yet. Add one with `/noprefix add`.',
            extra: 'They can type `n <command>` in any server, e.g. `n play`, `n help`, `n say`.',
          }),
        ],
      });
    }

    const user = interaction.options.getUser('user');

    if (sub === 'add') {
      const done = noprefix.addNoprefix(user.id);
      return reply(
        interaction,
        done
          ? { embeds: [successEmbed({ title: 'No-prefix granted', description: `**${user.tag}** (\`${user.id}\`) can now use \`n <command>\` messages.` })] }
          : { embeds: [warningEmbed({ title: 'Already Granted', description: `**${user.tag}** already has no-prefix access.` })], ephemeral: true }
      );
    }

    const done = noprefix.removeNoprefix(user.id);
    return reply(
      interaction,
      done
        ? { embeds: [successEmbed({ title: 'No-prefix revoked', description: `**${user.tag}** (\`${user.id}\`) lost the \`n <command>\` privilege.` })] }
        : { embeds: [warningEmbed({ title: 'Not Granted', description: `**${user.tag}** is not on the no-prefix list.` })], ephemeral: true }
    );
  }),
};