const { SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');
const { isBotOwner } = require('../../utils/owners');
const { loadCommands } = require('../../../scripts/loadCommands');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Refresh this server without interrupting anything'),
  botOwnerOnly: true,
  ownerOnly: true,
  async execute(interaction, client) {
    if (!interaction.guild || !isBotOwner(interaction.user.id)) {
      return interaction.reply({ content: 'Only the bot owner can use this command.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Same loader deploy.js uses, so /refresh registers exactly the deployed
    // set (excluding the scripts/exclude.js list). Pushed to GLOBAL scope only —
    // guild-scoped copies are what caused duplicate commands in the slash menu.
    const commands = loadCommands();
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    await rest.put(Routes.applicationGuildCommands(client.user.id, interaction.guild.id), { body: [] }).catch(() => {});

    await interaction.editReply(
      `Refreshed **${commands.length}** commands (global scope) and cleared stale guild-scoped commands in this server.`
    );
  },
};