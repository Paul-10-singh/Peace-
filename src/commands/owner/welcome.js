/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /welcome - configure and test server welcome messages (Owner only).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { successEmbed, warningEmbed, commandEmbed } = require('../../utils/decorations');
const { buildWelcomePayload, resolveWelcomeChannel } = require('../../utils/welcome');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure and test server welcome messages (Owner only)')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set up the welcome message channels and options')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Channel where welcome messages will be sent').setRequired(true)
        )
        .addChannelOption((o) =>
          o.setName('rules').setDescription('Rules channel to mention in the welcome embed').setRequired(false)
        )
        .addChannelOption((o) =>
          o.setName('chat').setDescription('Chat channel to mention in the welcome embed').setRequired(false)
        )
        .addChannelOption((o) =>
          o.setName('apply').setDescription('Guild application channel to mention in the welcome embed').setRequired(false)
        )
        .addRoleOption((o) =>
          o.setName('role').setDescription('Role to automatically give new members on join').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Preview the welcome message')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Channel to send preview into (defaults to current channel)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('enable').setDescription('Enable welcome messages')
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Disable welcome messages')
    )
    .addSubcommand((sub) =>
      sub.setName('info').setDescription('View current welcome configuration')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const current = get(guildId, 'welcome');

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      if (!channel?.isTextBased()) {
        return reply(interaction, {
          embeds: [warningEmbed({ description: 'Please choose a valid text channel for welcome messages.' })],
          ephemeral: true,
        });
      }

      const rules = interaction.options.getChannel('rules');
      const chat = interaction.options.getChannel('chat');
      const apply = interaction.options.getChannel('apply');
      const role = interaction.options.getRole('role');

      const updated = {
        ...current,
        enabled: true,
        channelId: channel.id,
        rulesChannelId: rules ? rules.id : current.rulesChannelId,
        chatChannelId: chat ? chat.id : current.chatChannelId,
        applyChannelId: apply ? apply.id : current.applyChannelId,
        roleId: role ? role.id : current.roleId,
      };

      set(guildId, 'welcome', updated);

      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'Welcome Messages Configured',
            description:
              `✅ Welcome channel set to <#${channel.id}>\n` +
              (updated.rulesChannelId ? `• Rules: <#${updated.rulesChannelId}>\n` : '') +
              (updated.chatChannelId ? `• Chat: <#${updated.chatChannelId}>\n` : '') +
              (updated.applyChannelId ? `• Guild Apply: <#${updated.applyChannelId}>\n` : '') +
              (updated.roleId ? `• Auto-Role: <@&${updated.roleId}>\n` : '') +
              `\nUse \`/welcome test\` to preview the message!`,
          }),
        ],
      });
    }

    if (sub === 'test') {
      const targetChannel =
        interaction.options.getChannel('channel') ||
        interaction.channel ||
        resolveWelcomeChannel(interaction.guild, current);

      if (!targetChannel?.isTextBased()) {
        return reply(interaction, {
          embeds: [warningEmbed({ description: 'Could not find a valid text channel to send preview.' })],
          ephemeral: true,
        });
      }

      const payload = buildWelcomePayload({
        guild: interaction.guild,
        member: interaction.member,
        inviter: interaction.user,
        config: current,
      });

      await targetChannel.send(payload).catch((err) => {
        return reply(interaction, {
          embeds: [warningEmbed({ description: `Failed to send preview: ${err.message}` })],
          ephemeral: true,
        });
      });

      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'Welcome Preview Sent',
            description: `A sample welcome message has been sent to <#${targetChannel.id}>.`,
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'enable') {
      set(guildId, 'welcome', { ...current, enabled: true });
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Welcome Enabled', description: 'Welcome messages are now active.' })],
      });
    }

    if (sub === 'disable') {
      set(guildId, 'welcome', { ...current, enabled: false });
      return reply(interaction, {
        embeds: [commandEmbed({ title: 'Welcome Disabled', description: 'Welcome messages have been turned off.' })],
      });
    }

    if (sub === 'info') {
      const welcomeChannel = current.channelId ? `<#${current.channelId}>` : 'Auto-detect (`#welcm`/`#welcome`)';
      const rulesChannel = current.rulesChannelId ? `<#${current.rulesChannelId}>` : 'Default / Auto-detect';
      const chatChannel = current.chatChannelId ? `<#${current.chatChannelId}>` : 'Default / Auto-detect';
      const applyChannel = current.applyChannelId ? `<#${current.applyChannelId}>` : 'Default / Auto-detect';
      const role = current.roleId ? `<@&${current.roleId}>` : 'None';

      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: 'Welcome Configuration',
            description:
              `**Status:** ${current.enabled !== false ? '🟢 Enabled' : '🔴 Disabled'}\n` +
              `**Welcome Channel:** ${welcomeChannel}\n` +
              `**Rules Channel:** ${rulesChannel}\n` +
              `**Chat Channel:** ${chatChannel}\n` +
              `**Apply Channel:** ${applyChannel}\n` +
              `**Auto-Role on Join:** ${role}`,
          }),
        ],
      });
    }
  },
};
