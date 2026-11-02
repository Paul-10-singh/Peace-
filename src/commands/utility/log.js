/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /log - Server audit & event logging configuration suite and interactive panel.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { successEmbed, warningEmbed, commandEmbed } = require('../../utils/decorations');
const { isOwner } = require('../../utils/owners');
const {
  LOG_CATEGORIES,
  buildPanelPayload,
  autoDetectChannels,
} = require('../../utils/logPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Configure server audit and event logs')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Open the interactive server logging configuration panel')
    )
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View all configured logging channels in the server')
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Directly assign a log channel for a category')
        .addStringOption((o) =>
          o
            .setName('category')
            .setDescription('Category to configure')
            .setRequired(true)
            .addChoices(
              ...Object.values(LOG_CATEGORIES).map((c) => ({
                name: `${c.emoji} ${c.name}`,
                value: c.key,
              }))
            )
        )
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Text channel to route logs to')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('autolink')
        .setDescription('Auto-detect and bind channels matching default log names')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guild = interaction.guild;
    const hasAccess =
      isOwner(interaction.user.id, guild.id, guild) ||
      interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!hasAccess) {
      return reply(interaction, {
        embeds: [warningEmbed({ description: 'You need `Manage Server` permission to configure logs.' })],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const payload = buildPanelPayload(guild, 'message', false);
      return interaction.reply({
        ...payload,
        ephemeral: false, // In-channel panel so server staff can manage
      });
    }

    if (sub === 'view') {
      const payload = buildPanelPayload(guild, 'message', true);
      return interaction.reply({
        embeds: payload.embeds,
        ephemeral: true,
      });
    }

    if (sub === 'set') {
      const categoryKey = interaction.options.getString('category');
      const channel = interaction.options.getChannel('channel');

      if (!channel?.isTextBased()) {
        return reply(interaction, {
          embeds: [warningEmbed({ description: 'Please pick a valid text-based channel.' })],
          ephemeral: true,
        });
      }

      const catInfo = LOG_CATEGORIES[categoryKey];
      const config = get(guild.id, 'logs') || {};
      config[categoryKey] = channel.id;

      // Keep alias keys updated
      if (categoryKey === 'ban') config.moderation = channel.id;
      if (categoryKey === 'entry') config.welcome = channel.id;
      if (categoryKey === 'exit') config.goodbye = channel.id;
      if (categoryKey === 'server') config.utility = channel.id;

      set(guild.id, 'logs', config);

      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'Log Channel Configured',
            description: `${catInfo.emoji} **${catInfo.name}** will now be logged to <#${channel.id}>.`,
          }),
        ],
      });
    }

    if (sub === 'autolink') {
      const { matched } = autoDetectChannels(guild);

      if (matched.length === 0) {
        return reply(interaction, {
          embeds: [
            commandEmbed({
              title: 'Auto-Link Finished',
              description:
                'No matching channels found (e.g. `#🔒〢ᴍᴇꜱꜱᴀɢᴇ_ʟᴏɢꜱ`, `#🔒〢ᴇɴᴛʀʏ_ʟᴏɢꜱ`, `#message_logs`, etc.).\n' +
                'Use `/log setup` to assign channels manually via the panel.',
            }),
          ],
          ephemeral: true,
        });
      }

      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'Auto-Link Channels Complete',
            description:
              `Successfully linked **${matched.length}** logging channel(s):\n\n` +
              matched.map((m) => `• **${m.category}** ➜ <#${m.id}>`).join('\n') +
              `\n\nUse \`/log setup\` to view or fine-tune.`,
          }),
        ],
      });
    }
  },
};
