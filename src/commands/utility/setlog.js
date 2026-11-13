/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { warningEmbed, successEmbed } = require('../../utils/decorations');

const CATEGORY_CHOICES = [
  { name: '🎙️ Voice Events (vc)', value: 'vc' },
  { name: '🎙️ Voice Events (voice)', value: 'voice' },
  { name: '💬 Message Events', value: 'message' },
  { name: '🔨 Moderation / Ban', value: 'moderation' },
  { name: '📥 Welcome / Entry', value: 'welcome' },
  { name: '📤 Goodbye / Exit', value: 'goodbye' },
  { name: '🏷️ Role Events', value: 'role' },
  { name: '📛 Nickname Events', value: 'nickname' },
  { name: '📨 Invite Events', value: 'invite' },
  { name: '🏛️ Server / Utility', value: 'utility' },
  { name: '🛡️ Security Events', value: 'security' },
];

const VALID_CATEGORIES = CATEGORY_CHOICES.map((c) => c.value);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlog')
    .setDescription('Set a channel for bot event logs')
    .addStringOption((o) =>
      o.setName('category')
        .setDescription('Log category to configure')
        .setRequired(true)
        .addChoices(...CATEGORY_CHOICES)
    )
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to send logs to').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const category = interaction.options.getString('category');
    const channel = interaction.options.getChannel('channel');

    if (!VALID_CATEGORIES.includes(category)) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'Invalid category selected.' })], ephemeral: true });
    }
    if (!channel?.isTextBased()) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'Please choose a valid text channel.' })], ephemeral: true });
    }

    const config = get(interaction.guild.id, 'logs') || {};
    config[category] = channel.id;

    // Cross-link alias keys so logs always route correctly
    if (category === 'vc' || category === 'voice') {
      config.vc = channel.id;
      config.voice = channel.id;
    }
    if (category === 'moderation') config.ban = channel.id;
    if (category === 'welcome') config.entry = channel.id;
    if (category === 'goodbye') config.exit = channel.id;
    if (category === 'utility') config.server = channel.id;

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
