/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { warningEmbed, successEmbed } = require('../../utils/decorations');

const LOG_CATEGORIES = [
  'moderation',
  'utility',
  'security',
  'welcome',
  'goodbye',
  'role',
  'message',
  'nickname',
  'invite',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlog')
    .setDescription('Set a channel for bot event logs')
    .addStringOption((o) =>
      o.setName('category')
        .setDescription('Log category to configure')
        .setRequired(true)
        .addChoices(...LOG_CATEGORIES.map((category) => ({ name: category, value: category })))
    )
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to send logs to').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const category = interaction.options.getString('category');
    const channel = interaction.options.getChannel('channel');

    if (!LOG_CATEGORIES.includes(category)) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'Invalid category selected.' })], ephemeral: true });
    }
    if (!channel?.isTextBased()) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'Please choose a valid text channel.' })], ephemeral: true });
    }

    const config = get(interaction.guild.id, 'logs');
    config[category] = channel.id;
    await set(interaction.guild.id, 'logs', config);

    await reply(interaction, {
      embeds: [
        successEmbed({
          title: 'Log channel configured',
          description: `**${category}** logs will now go to <#${channel.id}>.`,
        }),
      ],
    });
  },
};
