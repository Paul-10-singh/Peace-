/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, successEmbed, warningEmbed, errorEmbed } = require('../../utils/decorations');
const { isOwner } = require('../../utils/owners');
const { sendLog } = require('../../utils/logging');
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Send a direct message to a server member (owner/admin only)')
    .addUserOption((o) => o.setName('user').setDescription('The member to message').setRequired(true))
    .addStringOption((o) => o.setName('message').setDescription('The message to send').setRequired(true)),
  async execute(interaction) {
    // Owner/admin only — this can impersonate the bot, so keep it restricted.
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true;
    if (!isOwner(interaction.user.id, interaction.guild?.id) && !isAdmin) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Permission Denied', description: 'This command is restricted to the bot owner or a server admin.' })],
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user');
    const message = interaction.options.getString('message').trim();
    if (!message) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Empty Message', description: 'Message cannot be empty.' })],
        ephemeral: true,
      });
    }

    // The bot can only DM users it shares a server with — reject early if absent.
    const inServer = interaction.guild.members.cache.get(target.id);
    if (!inServer) {
      return reply(interaction, {
        embeds: [errorEmbed({ title: 'User Not Found', description: 'That user is not in this server, so the bot cannot DM them.' })],
        ephemeral: true,
      });
    }

    const embed = commandEmbed({
      description: message,
      extra: `Sent from ${interaction.guild.name}`,
    });

    try {
      await target.send({ embeds: [embed] });
    } catch {
      return reply(interaction, {
        embeds: [errorEmbed({ title: 'Delivery Failed', description: "Couldn't DM this user — they may have DMs disabled or have blocked the bot." })],
        ephemeral: true,
      });
    }

    await reply(interaction, {
      embeds: [successEmbed({ title: 'Message Sent', description: `Message sent to ${target.tag}.` })],
      ephemeral: true,
    });

    // Log for accountability (sender, recipient, content, timestamp).
    await sendLog(interaction.client, interaction.guild.id, 'moderation', {
      embeds: [
        commandEmbed({
          title: '📨 DM sent',
          fields: [
            { name: 'Sender', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Recipient', value: `<@${target.id}>`, inline: true },
            { name: 'Message', value: message.length > 900 ? message.slice(0, 900) + '…' : message },
          ],
        }),
      ],
    });
  },
};
