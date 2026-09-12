/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, warningEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setprofile')
    .setDescription('Update the bot profile (owner only)')
    .addStringOption((o) => o.setName('username').setDescription('New bot username'))
    .addStringOption((o) => o.setName('avatar').setDescription('URL of the new bot avatar image'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ownerOnly: true,
  async execute(interaction, client) {
    const username = interaction.options.getString('username');
    const avatarUrl = interaction.options.getString('avatar');

    if (!username && !avatarUrl) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Nothing to Update', description: 'Please provide a username or avatar URL.' })],
        ephemeral: true,
      });
    }

    const changes = [];
    if (username) {
      await client.user.setUsername(username).catch((error) => {
        throw new Error(`Username update failed: ${error.message}`);
      });
      changes.push('username');
    }

    if (avatarUrl) {
      const response = await fetch(avatarUrl);
      if (!response.ok) {
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Fetch Failed', description: 'Unable to fetch the avatar image from the provided URL.' })],
          ephemeral: true,
        });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await client.user.setAvatar(buffer).catch((error) => {
        throw new Error(`Avatar update failed: ${error.message}`);
      });
      changes.push('avatar');
    }

    await reply(interaction, {
      embeds: [successEmbed({ title: 'Bot Profile Updated', description: `Successfully updated: ${changes.join(', ')}.` })],
    });
  },
};
