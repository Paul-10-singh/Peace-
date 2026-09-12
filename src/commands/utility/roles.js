/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('List all roles in the server'),
  async execute(interaction) {
    const roles = interaction.guild.roles.cache
      .filter((r) => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `<@&${r.id}>`)
      .join(' ')
      .slice(0, 1024);

    const embed = commandEmbed({
      title: `Roles in ${interaction.guild.name}`,
      description: roles || 'No roles yet',
      extra: `${interaction.guild.roles.cache.size - 1} roles`,
    });

    await reply(interaction, { embeds: [embed] });
  },
};