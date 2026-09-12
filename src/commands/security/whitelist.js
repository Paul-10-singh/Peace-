/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply, chunkFieldValue } = require('../../utils/helpers');
const { successEmbed, commandEmbed } = require('../../utils/decorations');
const { getList, addToList, removeFromList } = require('../../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage trusted users who bypass all security filters')
    .addSubcommand((s) => s.setName('add').setDescription('Add a trusted user')
      .addUserOption((o) => o.setName('user').setDescription('The user to trust').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a trusted user')
      .addUserOption((o) => o.setName('user').setDescription('The user to untrust').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show all trusted users'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const list = getList(interaction.guild.id, 'security', 'whitelist');
      if (!list.length) {
        return reply(interaction, {
          embeds: [commandEmbed({ title: 'Trusted Users', description: 'No whitelisted users yet.' })],
        });
      }
      const fields = chunkFieldValue(list.map((id) => `<@${id}>`)).map((value, i) => ({
        name: i === 0 ? `Trusted Users (${list.length})` : 'Trusted Users (cont.)',
        value,
      }));
      return reply(interaction, {
        embeds: [commandEmbed({ title: 'Whitelist', fields })],
      });
    }

    const user = interaction.options.getUser('user');
    if (sub === 'add') {
      if (getList(interaction.guild.id, 'security', 'whitelist').includes(user.id)) {
        return reply(interaction, { content: `${user.tag} is already whitelisted.`, ephemeral: true });
      }
      addToList(interaction.guild.id, 'security', 'whitelist', user.id);
      await reply(interaction, {
        embeds: [successEmbed({ title: 'User Whitelisted', description: `${user.tag} is now whitelisted (bypasses all filters).` })],
      });
    } else {
      if (!getList(interaction.guild.id, 'security', 'whitelist').includes(user.id)) {
        return reply(interaction, { content: `${user.tag} is not whitelisted.`, ephemeral: true });
      }
      removeFromList(interaction.guild.id, 'security', 'whitelist', user.id);
      await reply(interaction, {
        embeds: [successEmbed({ title: 'User Removed', description: `${user.tag} was removed from the whitelist.` })],
      });
    }
  },
};
