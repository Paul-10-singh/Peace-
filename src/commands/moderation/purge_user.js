/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /purge_user - delete up to <count> of a specific user's messages in the
 * CURRENT channel (Owner only). Respects Discord's 14-day bulk-delete window.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('purge_user')
    .setDescription('Delete a user\'s messages in this channel (Owner only)')
    .addUserOption((o) => o.setName('user').setDescription('The user whose messages to delete').setRequired(true))
    .addIntegerOption((o) => o.setName('count').setDescription('Maximum messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const count = interaction.options.getInteger('count');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
    const fetched = await interaction.channel.messages.fetch({ limit: 100 });
    const toDelete = fetched
      .filter((m) => m.author.id === user.id && m.createdTimestamp > cutoff)
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
  },
};