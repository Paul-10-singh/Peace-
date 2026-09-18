const { SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');
const { isOwner } = require('../../utils/owners');
const { loadCommands } = require('../../../scripts/loadCommands');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Refresh this server without interrupting anything'),
  ownerOnly: true,
  async execute(interaction, client) {
    if (!interaction.guild || !isOwner(interaction.user.id, interaction.guild.id)) {
      return interaction.reply({ content: 'Only the bot owner can use this command.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Same loader deploy.js uses, so /refresh registers exactly the deployed
    // set (excluding the scripts/exclude.js list).
    const commands = loadCommands();
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, interaction.guild.id), { body: commands });

    await interaction.editReply(`Refreshed **${commands.length}** commands for this server.`);
  },
};