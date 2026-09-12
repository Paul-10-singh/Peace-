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
    .setName('words')
    .setDescription('Manage the custom blocked-words filter')
    .addSubcommand((s) => s.setName('add').setDescription('Add a word to the filter')
      .addStringOption((o) => o.setName('word').setDescription('The word or phrase to block').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a word from the filter')
      .addStringOption((o) => o.setName('word').setDescription('The word to unblock').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show all blocked words'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const words = getList(interaction.guild.id, 'security', 'words');
      if (!words.length) {
        return reply(interaction, {
          embeds: [commandEmbed({ title: 'Blocked Words', description: 'No blocked words yet. Add some with `/words add`.' })],
        });
      }
      const fields = chunkFieldValue(words.map((w) => `\`${w}\``)).map((value, i) => ({
        name: i === 0 ? `Blocked Words (${words.length})` : 'Blocked Words (cont.)',
        value,
      }));
      return reply(interaction, {
        embeds: [commandEmbed({ title: 'Blocked Words', fields })],
      });
    }

    const word = interaction.options.getString('word').trim().toLowerCase();
    if (!word) return reply(interaction, { content: 'Word cannot be empty.', ephemeral: true });

    if (sub === 'add') {
      if (getList(interaction.guild.id, 'security', 'words').includes(word)) {
        return reply(interaction, { content: `\`${word}\` is already blocked.`, ephemeral: true });
      }
      addToList(interaction.guild.id, 'security', 'words', word);
      await reply(interaction, {
        embeds: [successEmbed({ title: 'Word Blocked', description: `\`${word}\` is now blocked by the filter.` })],
      });
    } else {
      if (!getList(interaction.guild.id, 'security', 'words').includes(word)) {
        return reply(interaction, { content: `\`${word}\` is not in the filter.`, ephemeral: true });
      }
      removeFromList(interaction.guild.id, 'security', 'words', word);
      await reply(interaction, {
        embeds: [successEmbed({ title: 'Word Unblocked', description: `\`${word}\` is no longer blocked.` })],
      });
    }
  },
};
