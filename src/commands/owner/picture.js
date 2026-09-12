/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /picture - banners and icons (Owner only). Subcommands:
 * user [user] (banner), server (banner), icon (server icon).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('picture')
    .setDescription('Show banners and icons (Owner only)')
    .addSubcommand((s) => s.setName('user').setDescription('Show a user banner (Nitro required)')
      .addUserOption((o) => o.setName('user').setDescription('User (defaults to you)').setRequired(false)))
    .addSubcommand((s) => s.setName('server').setDescription('Show the server banner (Boosting level 2 required)'))
    .addSubcommand((s) => s.setName('icon').setDescription('Show the server icon')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'user') {
      const user = interaction.options.getUser('user') || interaction.user;
      const fetched = await user.fetch(true).catch(() => user);
      const banner = fetched.bannerURL({ size: 2048 });
      if (!banner) {
        return reply(interaction, { embeds: [errorEmbed({ description: `**${user.tag}** has no banner. (Banners require Nitro.)` })], ephemeral: true });
      }
      return reply(interaction, { embeds: [commandEmbed({ title: `${user.tag} banner`, image: banner })] });
    }

    if (sub === 'server') {
      const banner = interaction.guild.bannerURL({ size: 2048 });
      if (!banner) {
        return reply(interaction, { embeds: [errorEmbed({ description: `${interaction.guild.name} has no server banner. (Requires a **Boosting Level 2** server.)` })], ephemeral: true });
      }
      return reply(interaction, { embeds: [commandEmbed({ title: `${interaction.guild.name} banner`, image: banner })] });
    }

    const icon = interaction.guild.iconURL({ size: 1024, dynamic: true });
    if (!icon) return reply(interaction, { embeds: [errorEmbed({ description: `${interaction.guild.name} has no icon.` })], ephemeral: true });
    return reply(interaction, {
      embeds: [commandEmbed({ title: `${interaction.guild.name} icon`, image: icon })],
      files: [{ name: 'server-icon.png', attachment: icon }],
    });
  },
};