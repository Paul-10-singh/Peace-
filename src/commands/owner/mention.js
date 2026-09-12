/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /mention - ping a user repeatedly (owner only, max 10)
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, commandEmbed } = require('../../utils/decorations');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('mention')
    .setDescription('Ping a user repeatedly (Owner only)')
    .addUserOption((o) => o.setName('user').setDescription('User to ping').setRequired(true))
    .addIntegerOption((o) => o.setName('count').setDescription('Times to ping (1-10)').setMinValue(1).setMaxValue(10).setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const count = interaction.options.getInteger('count');
    if (user.bot) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Bots cannot be mentioned like that.' })], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ embeds: [commandEmbed({ title: 'Mentioning', description: `Pinging <@${user.id}> **${count}×**...`, extra: 'Owner only' })] });
    for (let i = 0; i < count; i++) {
      await interaction.channel.send(`<@${user.id}>`).catch(() => null);
      await delay(500);
    }
  },
};