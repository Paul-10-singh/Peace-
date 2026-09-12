/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, version: djsVersion } = require('discord.js');
const { COLORS } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');
const { getOwners, mainOwnerId } = require('../../utils/owners');
const pkg = require('../../../package.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Show bot information'),
  async execute(interaction, client) {
    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);

    const embed = commandEmbed({
      author: { name: client.user.tag, iconURL: client.user.displayAvatarURL({ dynamic: true, size: 256 }) },
      thumbnail: client.user.displayAvatarURL({ dynamic: true, size: 512 }),
      fields: [
        { name: 'Name', value: client.user.username, inline: true },
        { name: 'Bot ID', value: client.user.id, inline: true },
        { name: 'Library', value: `discord.js v${djsVersion}`, inline: true },
        { name: 'Version', value: `v${pkg.version || '1.0.0'}`, inline: true },
        { name: 'Uptime', value: `${(client.uptime / 3600000).toFixed(1)}h`, inline: true },
        { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
        { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Users', value: `${totalMembers}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:R>`, inline: true },
      ],
      extra: `Requested by ${interaction.user.tag}`,
    });

    // Keep the bot's own accent color when available; brand purple otherwise.
    if (client.user.accentColor) embed.setColor(client.user.accentColor);

    const owners = getOwners(interaction.guild?.id);
    if (owners.length) {
      embed.addFields({
        name: '👑 Owner(s)',
        value: owners.map((id) => `<@${id}>${id === mainOwnerId() ? ' *(main)*' : ''}`).join('\n'),
      });
    }

    // NOTE: Bot secrets (token, etc.) are NEVER shown in Discord.
    // They live only in the .env file on the host machine.
    await interaction.reply({ embeds: [embed] });
  },
};
