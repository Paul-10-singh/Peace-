/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /purge_all_server_user - delete a specific user's messages across EVERY
 * text channel in the server (Owner only). Rapid, so it runs sequentially per
 * channel and respects the 14-day bulk-delete window. Reports per-channel
 * counts and a total.
 */
const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('purge_all_server_user')
    .setDescription('Delete a user\'s messages across the whole server (Owner only)')
    .addUserOption((o) => o.setName('user').setDescription('The user whose messages to delete everywhere').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channels = [...interaction.guild.channels.cache.values()].filter(
      (c) => c.isTextBased() && c.type !== ChannelType.GuildVoice && c.viewable
    );
    const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
    let total = 0;
    let scanned = 0;

    for (const channel of channels) {
      try {
        const fetched = await channel.messages.fetch({ limit: 100 });
        const toDelete = fetched.filter((m) => m.author.id === user.id && m.createdTimestamp > cutoff);
        if (toDelete.size) {
          const deleted = await channel.bulkDelete(toDelete, true);
          total += deleted.size;
        }
      } catch {
        // Channel fetch/permission errors are non-fatal; keep going.
      }
      scanned += 1;
      if (scanned % 10 === 0) {
        await interaction.editReply({
          embeds: [commandEmbed({ title: 'Scanning Server', description: `Scanned **${scanned}/${channels.length}** channels - **${total}** messages deleted...` })],
        }).catch(() => {});
      }
    }

    const embed = commandEmbed({
      title: '<:delete:1536416055851876354> Purged Across Server',
      description: `Deleted **${total}** message${total === 1 ? '' : 's'} from **${user.tag}** across ${channels.length} channels.`,
    });
    await interaction.editReply({ embeds: [embed] });
  },
};