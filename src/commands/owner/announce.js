/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send an announcement embed to a channel (Owner only)')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to post in').setRequired(true))
    .addStringOption((o) => o.setName('title').setDescription('Announcement title').setRequired(true))
    .addStringOption((o) => o.setName('message').setDescription('Announcement text').setRequired(true))
    .addRoleOption((o) => o.setName('ping').setDescription('Optional role to ping').setRequired(false)),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const ping = interaction.options.getRole('ping');

    if (!channel.isTextBased()) return reply(interaction, { embeds: [errorEmbed({ description: 'That is not a text channel.' })], ephemeral: true });

    const embed = commandEmbed({
      title: `📢 ${title}`,
      description: message,
      extra: `— ${interaction.user.tag}`,
    });

    await channel.send({
      content: ping ? `<@&${ping.id}>` : undefined,
      embeds: [embed],
      allowedMentions: { roles: ping ? [ping.id] : [] },
    });

    return reply(interaction, { embeds: [commandEmbed({ description: `Announcement sent to <#${channel.id}>.` })], ephemeral: true });
  },
};