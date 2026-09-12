/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages in the current channel')
    .addIntegerOption((o) => o.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const toDelete = messages
      .filter((m) => m.createdTimestamp > Date.now() - 14 * 24 * 3600 * 1000)
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
  },
};
