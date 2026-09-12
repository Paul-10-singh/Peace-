/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, errorEmbed } = require('../../utils/decorations');
const snipe = require('../../utils/snipe');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Show the most recently deleted message in a channel (Owner only)')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to snipe (defaults to this one)').setRequired(false))
    .addIntegerOption((o) => o.setName('index').setDescription('Older entry (1 = previous, 2 = before that...)').setRequired(false).setMinValue(1)),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const index = (interaction.options.getInteger('index') || 1) - 1;
    const entry = snipe.get(channel.id, index);

    if (!entry) {
      const count = snipe.count(channel.id);
      return reply(interaction, {
        embeds: [
          errorEmbed({
            description: count
              ? `Only **${count}** deleted message${count === 1 ? ' is' : 's are'} cached here.`
              : `No deleted messages cached in <#${channel.id}>.`,
          }),
        ],
        ephemeral: true,
      });
    }

    const fields = [
      { name: 'Author', value: `${entry.authorTag} (\`${entry.authorId}\`)`, inline: true },
      { name: 'Deleted', value: `<t:${Math.floor(entry.deletedAt / 1000)}:R>`, inline: true },
    ];
    if (entry.attachment) fields.push({ name: 'Attachment', value: entry.attachment, inline: false });

    return reply(interaction, {
      embeds: [
        commandEmbed({
          title: '🧹 Sniped message',
          description: entry.content || (entry.attachment ? '*[message was only an attachment]*' : '*[embed only]*'),
          fields,
          thumbnail: entry.avatar,
        }),
      ],
    });
  },
};