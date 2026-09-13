const { SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');
const { isOwner } = require('../../utils/owners');
const { refreshPanel } = require('../../music/nowPlaying');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Refresh this server without interrupting music'),
  ownerOnly: true,
  async execute(interaction, client) {
    if (!interaction.guild || !isOwner(interaction.user.id, interaction.guild.id)) {
      return interaction.reply({ content: 'Only the bot owner can use this command.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const commands = [...client.commands.values()]
      .filter((command) => command?.data?.toJSON)
      .map((command) => command.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, interaction.guild.id), { body: commands });

    const queue = client.music?.getQueue(interaction.guild.id);
    if (queue?.currentTrack) await refreshPanel(client, interaction.guild.id);

    await interaction.editReply(
      `Refreshed **${commands.length}** commands for this server. Music session ${queue?.currentTrack ? 'was preserved' : 'is idle'}.`
    );
  },
};
