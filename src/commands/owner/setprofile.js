/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, warningEmbed, errorEmbed } = require('../../utils/decorations');
const { isBotOwner } = require('../../utils/owners');

module.exports = {
  botOwnerOnly: true,
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('setprofile')
    .setDescription('Update the bot profile username and/or avatar (Bot Owner only)')
    .addStringOption((o) => o.setName('username').setDescription('New bot username'))
    .addStringOption((o) => o.setName('avatar').setDescription('URL of the new bot avatar image'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, client) {
    if (!isBotOwner(interaction.user.id)) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Permission Denied', description: 'This command is strictly reserved for the **Bot Owner**.' })],
        ephemeral: true,
      });
    }

    const username = interaction.options.getString('username');
    const avatarUrl = interaction.options.getString('avatar');

    if (!username && !avatarUrl) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Nothing to Update', description: 'Please provide a username or avatar URL.' })],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });
    const botClient = client || interaction.client;
    const changes = [];

    if (username) {
      try {
        await botClient.user.setUsername(username);
        changes.push(`username to **${username}**`);
      } catch (err) {
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Username Update Failed', description: err.message || 'Discord rate limit or invalid username.' })],
          ephemeral: true,
        });
      }
    }

    if (avatarUrl) {
      try {
        const response = await fetch(avatarUrl);
        if (!response.ok) {
          return reply(interaction, {
            embeds: [errorEmbed({ title: 'Fetch Failed', description: 'Unable to fetch the avatar image from the provided URL.' })],
            ephemeral: true,
          });
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        await botClient.user.setAvatar(buffer);
        changes.push('avatar image');
      } catch (err) {
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Avatar Update Failed', description: err.message || 'Failed to update avatar image.' })],
          ephemeral: true,
        });
      }
    }

    return reply(interaction, {
      embeds: [successEmbed({ title: 'Bot Profile Updated', description: `Successfully updated ${changes.join(' and ')}.` })],
      ephemeral: true,
    });
  },
};
