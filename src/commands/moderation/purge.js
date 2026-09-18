/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /purge - one command for every bulk-message deletion task:
 *   /purge messages <amount> [user]   - delete N fresh messages (optionally from one user)
 *   /purge user <user> <count>        - delete up to <count> of a user's messages in this channel
 *   /purge all <user>                 - delete a user's messages across the WHOLE server
 *   /purge bot [channel] [amount]     - delete bot messages in a channel
 *
 * All respect Discord's 14-day bulk-delete window.
 */
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages by amount, user, or bot')
    .addSubcommand((s) =>
      s
        .setName('messages')
        .setDescription('Delete N recent messages (optionally from one user)')
        .addIntegerOption((o) => o.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user')))
    .addSubcommand((s) =>
      s
        .setName('user')
        .setDescription('Delete a user\'s messages in this channel')
        .addUserOption((o) => o.setName('user').setDescription('The user whose messages to delete').setRequired(true))
        .addIntegerOption((o) => o.setName('count').setDescription('Maximum messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)))
    .addSubcommand((s) =>
      s
        .setName('all')
        .setDescription('Delete a user\'s messages across the whole server')
        .addUserOption((o) => o.setName('user').setDescription('The user whose messages to delete everywhere').setRequired(true)))
    .addSubcommand((s) =>
      s
        .setName('bot')
        .setDescription('Delete bot messages in a channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to scan (defaults to this one)'))
        .addIntegerOption((o) => o.setName('amount').setDescription('Max messages to scan (default 500, max 1000)').setMinValue(1).setMaxValue(1000)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cutoff = () => Date.now() - 14 * 24 * 3600 * 1000;

    // ── /purge messages <amount> [user] ─────────────────────────────
    if (sub === 'messages') {
      const amount = interaction.options.getInteger('amount');
      const user = interaction.options.getUser('user');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const toDelete = messages
        .filter((m) => m.createdTimestamp > cutoff())
        .filter((m) => !user || m.author.id === user.id)
        .first(amount);

      const deleted = await interaction.channel.bulkDelete(toDelete, true);

      await interaction.editReply({
        embeds: [
          commandEmbed({
            title: '<:delete:1536416055851876354> Messages Purged',
            description: `Deleted **${deleted.size}** message(s)${user ? ` (from ${user.tag})` : ''}.`,
            fields: [
              { name: 'Channel', value: `#${interaction.channel.name}`, inline: true },
              { name: 'Deleted', value: `${deleted.size}`, inline: true },
            ],
            extra: `By ${interaction.user.tag}`,
          }),
        ],
      });
      return;
    }

    // ── /purge user <user> <count> ──────────────────────────────────
    if (sub === 'user') {
      const user = interaction.options.getUser('user');
      const count = interaction.options.getInteger('count');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const fetched = await interaction.channel.messages.fetch({ limit: 100 });
      const toDelete = fetched
        .filter((m) => m.author.id === user.id && m.createdTimestamp > cutoff())
        .first(count);

      const deleted = await interaction.channel.bulkDelete(toDelete, true);

      const embed = deleted.size > 0
        ? commandEmbed({
            title: '<:delete:1536416055851876354> Purged User Messages',
            description: `Deleted **${deleted.size}** message${deleted.size === 1 ? '' : 's'} from **${user.tag}**.`,
            fields: [
              { name: 'Channel', value: `#${interaction.channel.name}`, inline: true },
              { name: 'Remaining requested', value: `${count}`, inline: true },
            ],
          })
        : commandEmbed({ title: 'Nothing Deleted', description: `No messages from **${user.tag}** in the last 14 days.` });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /purge all <user> ───────────────────────────────────────────
    if (sub === 'all') {
      const user = interaction.options.getUser('user');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channels = [...interaction.guild.channels.cache.values()].filter(
        (c) => c.isTextBased() && c.type !== ChannelType.GuildVoice && c.viewable
      );
      let total = 0;
      let scanned = 0;

      for (const channel of channels) {
        try {
          const fetched = await channel.messages.fetch({ limit: 100 });
          const toDelete = fetched.filter((m) => m.author.id === user.id && m.createdTimestamp > cutoff());
          if (toDelete.size) {
            const deleted = await channel.bulkDelete(toDelete, true);
            total += deleted.size;
          }
        } catch {
          // Channel fetch/permission errors are non-fatal; keep going.
        }
        scanned += 1;
        if (scanned % 10 === 0) {
          await interaction
            .editReply({
              embeds: [commandEmbed({ title: 'Scanning Server', description: `Scanned **${scanned}/${channels.length}** channels - **${total}** messages deleted...` })],
            })
            .catch(() => {});
        }
      }

      const embed = commandEmbed({
        title: '<:delete:1536416055851876354> Purged Across Server',
        description: `Deleted **${total}** message${total === 1 ? '' : 's'} from **${user.tag}** across ${channels.length} channels.`,
      });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /purge bot [channel] [amount] ───────────────────────────────
    if (sub === 'bot') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const amount = interaction.options.getInteger('amount') || 500;

      if (!channel.isTextBased()) return reply(interaction, { embeds: [errorEmbed({ description: 'That is not a text channel.' })], ephemeral: true });

      await interaction.deferReply();

      let deleted = 0;
      let scanned = 0;
      let before;
      try {
        while (scanned < amount) {
          const batch = await channel.messages.fetch({ limit: Math.min(100, amount - scanned), before });
          if (!batch.size) break;
          scanned += batch.size;
          before = batch.last().id;
          const botMessages = batch.filter((m) => m.author?.bot);
          deleted += botMessages.size;
          if (botMessages.size) await channel.bulkDelete(botMessages, true);
        }
      } catch (err) {
        return interaction.editReply({ embeds: [errorEmbed({ description: `Failed: ${err.message}` })] });
      }

      return interaction.editReply({
        embeds: [
          successEmbed({ title: '🤖 Bots purged', description: `Deleted **${deleted}** bot message${deleted === 1 ? '' : 's'} out of **${scanned}** scanned in <#${channel.id}>.` }),
        ],
      });
    }
  },
};