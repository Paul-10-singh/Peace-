/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /trusted - manage the bot-wide trusted list (users allowed to run
 * restricted commands). Owners only. Stored in data/whitelist.json and
 * survives restarts. List is owner-only for auditability and never exposed
 * to non-owners.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, successEmbed, warningEmbed } = require('../../utils/decorations');
const { requireAccess } = require('../../utils/access');
const whitelist = require('../../utils/whitelist');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trusted')
    .setDescription('Manage bot-wide trusted members allowed to use restricted commands (owners only)')
    .addSubcommand((s) => s.setName('add').setDescription('Grant a user access to restricted commands')
      .addUserOption((o) => o.setName('user').setDescription('The user to trust').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Revoke a user\'s access to restricted commands')
      .addUserOption((o) => o.setName('user').setDescription('The user to untrust').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show all trusted user IDs (owner only)')),
  execute: requireAccess({ level: 'owner' })(async (interaction) => {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const ids = whitelist.list(interaction.guild.id);
      const extra = whitelist.isHealthy()
        ? 'Stored in data/whitelist.json'
        : '<a:wrong:1550504971303395430> Whitelist storage failed to load - access is denied for everyone.';
      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: '🤝 Trusted members',
            description: ids.length
              ? ids.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n')
              : 'No trusted members yet. Add one with `/trusted add`.',
            extra,
          }),
        ],
      });
    }

    const user = interaction.options.getUser('user');

    if (sub === 'add') {
      const { added } = await whitelist.add(user.id, interaction.guild.id);
      return reply(
        interaction,
        added
          ? { embeds: [successEmbed({ title: 'Member Trusted', description: `**${user.tag}** (\`${user.id}\`) now has access to restricted commands.` })] }
          : { embeds: [warningEmbed({ title: 'Already Trusted', description: `**${user.tag}** is already trusted.` })], ephemeral: true }
      );
    }

    const { removed } = await whitelist.remove(user.id, interaction.guild.id);
    return reply(
      interaction,
      removed
        ? { embeds: [successEmbed({ title: 'Access Revoked', description: `**${user.tag}** (\`${user.id}\`) lost access to restricted commands.` })] }
        : { embeds: [warningEmbed({ title: 'Not Trusted', description: `**${user.tag}** is not on the trusted list.` })], ephemeral: true }
    );
  }),
};
