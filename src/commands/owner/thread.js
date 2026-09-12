const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('thread')
    .setDescription('Manage threads (Owner only)')
    .addSubcommand((s) => s.setName('create').setDescription('Create a thread').addStringOption((o) => o.setName('name').setDescription('Thread name').setRequired(true)).addBooleanOption((o) => o.setName('private').setDescription('Create a private thread').setRequired(false)))
    .addSubcommand((s) => s.setName('archive').setDescription('Archive this thread'))
    .addSubcommand((s) => s.setName('lock').setDescription('Lock this thread'))
    .addSubcommand((s) => s.setName('unlock').setDescription('Unlock this thread')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'create') {
        if (!interaction.channel.isTextBased() || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(interaction.channel.type)) throw new Error('Run this in a text or announcement channel.');
        const thread = await interaction.channel.threads.create({ name: interaction.options.getString('name'), type: interaction.options.getBoolean('private') ? ChannelType.PrivateThread : ChannelType.PublicThread, reason: `Created by ${interaction.user.tag}` });
        return reply(interaction, { embeds: [successEmbed({ description: `Created <#${thread.id}>.` })] });
      }
      if (!interaction.channel.isThread()) throw new Error('Run this command inside a thread.');
      if (sub === 'archive') await interaction.channel.setArchived(true);
      if (sub === 'lock') await interaction.channel.setLocked(true);
      if (sub === 'unlock') await interaction.channel.setLocked(false);
      return reply(interaction, { embeds: [commandEmbed({ title: 'Thread updated', description: `Thread **${interaction.channel.name}**: **${sub}**.` })] });
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: err.message })], ephemeral: true });
    }
  },
};