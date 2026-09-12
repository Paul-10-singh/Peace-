const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder().setName('all').setDescription('Show all available commands'),
  async execute(interaction, client) {
    const commands = [...client.commands.values()]
      .sort((a, b) => a.data.name.localeCompare(b.data.name))
      .map((command) => `/${command.data.name}`);
    return reply(interaction, {
      embeds: [commandEmbed({ title: 'All commands', description: commands.join(' · ') })],
      ephemeral: true,
    });
  },
};