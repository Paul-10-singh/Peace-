/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('leaveserver')
    .setDescription('Make the bot leave a server (Owner only)')
    .addStringOption((o) => o.setName('guild_id').setDescription('Server ID to leave').setRequired(true)),
  async execute(interaction) {
    const guildId = interaction.options.getString('guild_id');
    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) return reply(interaction, { embeds: [errorEmbed({ description: `I am not in a server with ID \`${guildId}\`.` })], ephemeral: true });

    const name = guild.name;
    await guild.leave();
    return reply(interaction, { embeds: [successEmbed({ description: `Left **${name}** (\`${guildId}\`).` })] });
  },
};