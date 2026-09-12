/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show information about this server'),
  async execute(interaction) {
    const g = interaction.guild;

    const embed = commandEmbed({
      author: { name: g.name, iconURL: g.iconURL({ dynamic: true, size: 256 }) },
      thumbnail: g.iconURL({ dynamic: true, size: 512 }),
      fields: [
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Members', value: `${g.memberCount}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Channels', value: `${g.channels.cache.filter((c) => c.type === 0).size} text / ${g.channels.cache.filter((c) => c.type === 2).size} voice`, inline: true },
        { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
        { name: 'Boost level', value: `${g.premiumTier}`, inline: true },
      ],
    });

    await reply(interaction, { embeds: [embed] });
  },
};