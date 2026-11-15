/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /emojipilot - Configure automatic emoji reactions when specified users
 * are mentioned (@user) or their messages are replied to.
 * Strictly isolated per server.
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, warningEmbed, commandEmbed } = require('../../utils/decorations');
const { isOwner, isBotOwner } = require('../../utils/owners');
const {
  parseEmoji,
  getEmojiPilotConfig,
  setEmojiPilotTarget,
  removeEmojiPilotTarget,
  clearEmojiPilot,
} = require('../../utils/emojipilot');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emojipilot')
    .setDescription('Configure auto-emoji reactions when targeted users are mentioned or replied to')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set or update an auto-reaction emoji for a user in this server')
        .addUserOption((o) =>
          o.setName('user').setDescription('Target user to trigger auto-reactions').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('emoji').setDescription('Emoji to react with (Unicode or server custom emoji)').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove auto-reaction for a user in this server')
        .addUserOption((o) =>
          o.setName('user').setDescription('User to remove auto-reactions for').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List all active EmojiPilot configurations in this server')
    )
    .addSubcommand((sub) =>
      sub.setName('clear').setDescription('Clear all EmojiPilot configurations in this server')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guild) {
      return reply(interaction, {
        embeds: [warningEmbed({ description: 'This command can only be used in a server.' })],
        ephemeral: true,
      });
    }

    // Permission check: Server Owner, Bot Owner, Administrator, or ManageGuild
    const member = interaction.member;
    const hasPermission =
      isOwner(interaction.user.id, interaction.guild.id, interaction.guild) ||
      isBotOwner(interaction.user.id) ||
      member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      member?.permissions?.has(PermissionFlagsBits.ManageGuild);

    if (!hasPermission) {
      return reply(interaction, {
        embeds: [
          warningEmbed({
            title: 'Permission Denied',
            description: 'You need **Manage Server** or **Administrator** permissions to configure EmojiPilot.',
          }),
        ],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'set') {
      const targetUser = interaction.options.getUser('user');
      const rawEmoji = interaction.options.getString('emoji');

      if (!targetUser) {
        return reply(interaction, {
          embeds: [warningEmbed({ description: 'Please specify a valid user.' })],
          ephemeral: true,
        });
      }

      if (targetUser.bot) {
        return reply(interaction, {
          embeds: [warningEmbed({ description: 'You cannot set EmojiPilot auto-reactions on bot accounts.' })],
          ephemeral: true,
        });
      }

      const result = setEmojiPilotTarget(guildId, targetUser.id, rawEmoji, interaction.user.id);
      if (!result.success) {
        return reply(interaction, {
          embeds: [
            warningEmbed({
              title: 'Invalid Emoji',
              description: result.error || 'Please provide a valid Unicode or server custom emoji.',
            }),
          ],
          ephemeral: true,
        });
      }

      return reply(interaction, {
        embeds: [
          successEmbed({
            title: '✈️ EmojiPilot Configured',
            description:
              `Successfully set auto-reaction for <@${targetUser.id}>!\n\n` +
              `• **Target User:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\`)\n` +
              `• **Reaction Emoji:** ${result.displayEmoji}\n` +
              `• **Scope:** This server only (\`${interaction.guild.name}\`)\n\n` +
              `Whenever someone **mentions** <@${targetUser.id}> or **replies** to their messages in this server, ` +
              `Peace✘ will automatically react with ${result.displayEmoji}.`,
          }),
        ],
      });
    }

    if (sub === 'remove') {
      const targetUser = interaction.options.getUser('user');
      if (!targetUser) {
        return reply(interaction, {
          embeds: [warningEmbed({ description: 'Please specify a valid user.' })],
          ephemeral: true,
        });
      }

      const removed = removeEmojiPilotTarget(guildId, targetUser.id);
      if (!removed) {
        return reply(interaction, {
          embeds: [
            warningEmbed({
              description: `<@${targetUser.id}> does not have an active EmojiPilot configuration in this server.`,
            }),
          ],
          ephemeral: true,
        });
      }

      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'EmojiPilot Removed',
            description: `Auto-reactions for <@${targetUser.id}> have been removed from this server.`,
          }),
        ],
      });
    }

    if (sub === 'list') {
      const config = getEmojiPilotConfig(guildId);
      const entries = Object.entries(config.targets);

      if (entries.length === 0) {
        return reply(interaction, {
          embeds: [
            commandEmbed({
              title: '✈️ EmojiPilot Configurations',
              description:
                `No users are currently configured for EmojiPilot in **${interaction.guild.name}**.\n\n` +
                `Use \`/emojipilot set user:@user emoji:<emoji>\` to add one!`,
            }),
          ],
        });
      }

      const listLines = entries.map(([userId, data], idx) => {
        return `**${idx + 1}.** <@${userId}> ➜ ${data.emoji} (Added <t:${Math.floor((data.addedAt || Date.now()) / 1000)}:R>)`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`✈️ EmojiPilot Targets — ${interaction.guild.name}`)
        .setDescription(
          `Whenever any user **mentions** or **replies** to the following members in this server, the bot auto-reacts:\n\n` +
          listLines.join('\n')
        )
        .setFooter({ text: `Total targets: ${entries.length} • Server Isolated` })
        .setTimestamp();

      return reply(interaction, { embeds: [embed] });
    }

    if (sub === 'clear') {
      const count = clearEmojiPilot(guildId);
      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'EmojiPilot Cleared',
            description: `Cleared all **${count}** EmojiPilot configuration(s) in this server.`,
          }),
        ],
      });
    }
  },
};
