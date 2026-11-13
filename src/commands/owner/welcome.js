/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /welcome - configure and test server welcome messages & welcome DMs (Owner only).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { successEmbed, warningEmbed, commandEmbed } = require('../../utils/decorations');
const {
  buildWelcomePayload,
  resolveWelcomeChannel,
  buildWelcomeDMPayload,
  buildWelcomeDmModal,
} = require('../../utils/welcome');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure and test server welcome messages and DMs (Owner only)')
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
        .setName('dm')
        .setDescription('Configure, customize or test server Welcome DM message')
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('DM action to perform')
            .setRequired(true)
            .addChoices(
              { name: '✏️ Edit DM Description (Popup Modal)', value: 'edit' },
              { name: '💬 Set Custom DM Message', value: 'set' },
              { name: '📨 Test Welcome DM (Send to my DMs)', value: 'test' },
              { name: '👁️ View Current Welcome DM', value: 'view' },
              { name: '🔄 Reset to Default Dynamic DM', value: 'reset' },
              { name: '✅ Enable Welcome DM', value: 'enable' },
              { name: '❌ Disable Welcome DM', value: 'disable' }
            )
        )
        .addStringOption((o) =>
          o
            .setName('message')
            .setDescription('Custom description / message (for action:set, or use action:edit for popup editor)')
            .setRequired(false)
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
    const current = get(guildId, 'welcome') || {};

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
              (updated.applyChannelId ? `• Guild Apply / Support: <#${updated.applyChannelId}>\n` : '') +
              (updated.roleId ? `• Auto-Role: <@&${updated.roleId}>\n` : '') +
              `\nUse \`/welcome test\` to preview channel message or \`/welcome dm action:test\` to preview your Welcome DM!`,
          }),
        ],
      });
    }

    if (sub === 'dm') {
      const action = interaction.options.getString('action');
      const message = interaction.options.getString('message');

      if (action === 'edit') {
        const modal = buildWelcomeDmModal(current.customDmText || '');
        return interaction.showModal(modal);
      }

      if (action === 'set') {
        if (!message) {
          return reply(interaction, {
            embeds: [
              warningEmbed({
                description: 'Please provide a message with `message:<text>`, or choose `action:✏️ Edit DM Description` to open the full popup editor.',
              }),
            ],
            ephemeral: true,
          });
        }
        const updated = { ...current, customDmText: message, dmEnabled: true };
        await set(guildId, 'welcome', updated);

        const previewPayload = buildWelcomeDMPayload({
          guild: interaction.guild,
          member: interaction.member || interaction.user,
          config: updated,
        });

        return reply(interaction, {
          embeds: [
            successEmbed({
              title: 'Welcome DM Updated',
              description: '✅ Custom Welcome DM message has been saved for this server!\n\n**Preview:**',
            }),
            ...(previewPayload?.embeds || []),
          ],
          ephemeral: true,
        });
      }

      if (action === 'test') {
        const payload = buildWelcomeDMPayload({
          guild: interaction.guild,
          member: interaction.member || interaction.user,
          config: current,
        });
        if (!payload) {
          return reply(interaction, {
            embeds: [
              warningEmbed({
                description: 'Welcome DMs are currently disabled for this server. Use `/welcome dm action:enable` to enable.',
              }),
            ],
            ephemeral: true,
          });
        }

        const sent = await interaction.user.send(payload).catch(() => null);
        if (!sent) {
          return reply(interaction, {
            embeds: [
              warningEmbed({
                description: 'Could not send DM. Please check your Discord privacy settings (allow direct messages from server members).',
              }),
            ],
            ephemeral: true,
          });
        }

        return reply(interaction, {
          embeds: [
            successEmbed({
              title: 'Welcome DM Test Sent!',
              description: '📬 Check your DMs! A live preview has been sent to you.',
            }),
          ],
          ephemeral: true,
        });
      }

      if (action === 'view') {
        const payload = buildWelcomeDMPayload({
          guild: interaction.guild,
          member: interaction.member || interaction.user,
          config: current,
        });

        const statusText = current.dmEnabled === false ? '❌ Disabled' : '✅ Enabled';
        const typeText = current.customDmText ? 'Customized by Server Owner' : 'Default Dynamic Template';

        return reply(interaction, {
          embeds: [
            commandEmbed({
              title: 'Welcome DM Configuration',
              description:
                `**Status:** ${statusText}\n` +
                `**Type:** ${typeText}\n\n` +
                `**Placeholders you can use:**\n` +
                `• \`{user}\` ➔ Mention member\n` +
                `• \`{username}\` ➔ Username\n` +
                `• \`{server}\` ➔ Server name\n` +
                `• \`{memberCount}\` ➔ Total members\n` +
                `• \`{rules}\` ➔ Clickable link to Rules\n` +
                `• \`{chat}\` ➔ Clickable link to Chat\n` +
                `• \`{support}\` ➔ Clickable link to Support/Apply\n` +
                `• \`{serverLink}\` ➔ Server link\n\n` +
                `**Live Preview below:**`,
            }),
            ...(payload?.embeds || []),
          ],
          ephemeral: true,
        });
      }

      if (action === 'reset') {
        const { customDmText, ...rest } = current;
        await set(guildId, 'welcome', rest);
        return reply(interaction, {
          embeds: [
            successEmbed({
              title: 'Welcome DM Reset',
              description: '✅ Custom Welcome DM has been reset to the default dynamic server format.',
            }),
          ],
          ephemeral: true,
        });
      }

      if (action === 'enable') {
        await set(guildId, 'welcome', { ...current, dmEnabled: true });
        return reply(interaction, {
          embeds: [
            successEmbed({
              title: 'Welcome DM Enabled',
              description: '✅ Welcome DMs are now active for new members joining this server.',
            }),
          ],
          ephemeral: true,
        });
      }

      if (action === 'disable') {
        await set(guildId, 'welcome', { ...current, dmEnabled: false });
        return reply(interaction, {
          embeds: [
            commandEmbed({
              title: 'Welcome DM Disabled',
              description: '❌ Welcome DMs are now turned off for new members joining this server.',
            }),
          ],
          ephemeral: true,
        });
      }
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
      const dmStatus = current.dmEnabled === false ? '🔴 Disabled' : '🟢 Enabled';
      const dmType = current.customDmText ? 'Customized by Server Owner' : 'Default Dynamic Template';

      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: 'Welcome Configuration',
            description:
              `**Channel Welcome:** ${current.enabled !== false ? '🟢 Enabled' : '🔴 Disabled'}\n` +
              `**Welcome Channel:** ${welcomeChannel}\n` +
              `**Rules Channel:** ${rulesChannel}\n` +
              `**Chat Channel:** ${chatChannel}\n` +
              `**Apply / Support:** ${applyChannel}\n` +
              `**Auto-Role on Join:** ${role}\n` +
              `**Welcome DM:** ${dmStatus} (${dmType})`,
          }),
        ],
      });
    }
  },
};
