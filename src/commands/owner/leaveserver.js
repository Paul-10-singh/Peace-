/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed, warningEmbed } = require('../../utils/decorations');
const { isBotOwner } = require('../../utils/owners');

module.exports = {
  botOwnerOnly: true,
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('leaveserver')
    .setDescription('Make the bot leave a server (Owner only)')
    .addStringOption((o) => o.setName('guild_id').setDescription('Server ID to leave').setRequired(true)),
  async execute(interaction) {
    if (!isBotOwner(interaction.user.id)) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Permission Denied', description: 'This command is strictly reserved for the **Bot Owner**.' })],
        ephemeral: true,
      });
    }
    const guildId = interaction.options.getString('guild_id');
    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) return reply(interaction, { embeds: [errorEmbed({ description: `I am not in a server with ID \`${guildId}\`.` })], ephemeral: true });

    const name = guild.name;
    await reply(interaction, { embeds: [successEmbed({ description: `Successfully left **${name}** (\`${guildId}\`).` })], ephemeral: true });
    await guild.leave().catch(() => {});
  },
};
