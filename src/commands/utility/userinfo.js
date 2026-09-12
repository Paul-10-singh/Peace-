/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { reply, COLORS, footer } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a user')
    .addUserOption((o) => o.setName('user').setDescription('The user (defaults to you)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const embed = new EmbedBuilder()
      .setColor(user.accentColor || COLORS.main)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
      .addFields(
        { name: 'User ID', value: user.id, inline: true },
        { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Joined server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Not in server', inline: true }
      );

    if (member && member.roles.cache.size > 1) {
      embed.addFields({
        name: `Roles (${member.roles.cache.size - 1})`,
        value: member.roles.cache.filter((r) => r.id !== interaction.guild.id).map((r) => `<@&${r.id}>`).join(' ').slice(0, 1024) || 'None',
      });
    }

    embed.setFooter(footer(`Requested by ${interaction.user.tag}`)).setTimestamp();
    await reply(interaction, { embeds: [embed] });
  },
};