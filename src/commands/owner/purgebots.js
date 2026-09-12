/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('purgebots')
    .setDescription('Delete every bot message in a channel (Owner only)')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to scan (defaults to this one)').setRequired(false))
    .addIntegerOption((o) => o.setName('amount').setDescription('Max messages to scan (default 500, max 1000)').setRequired(false).setMinValue(1).setMaxValue(1000)),
  async execute(interaction) {
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
  },
};