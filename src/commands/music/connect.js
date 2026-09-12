/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /join - connect the bot to your voice channel (Pro parity).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { requireVoice } = require('../../music/voice');

module.exports = {
  data: new SlashCommandBuilder().setName('connect').setDescription('Connect to your voice channel'),
  async execute(interaction, client) {
    const vc = requireVoice(interaction, client);
    if (!vc.ok) return reply(interaction, vc.reply);

    try {
      await client.music.ensureConnected(interaction.guild, vc.channel, { requestedBy: interaction.user.tag });
      return reply(interaction, { embeds: [successEmbed({ description: `Joined <#${vc.channel.id}>` })] });
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Could not join: ${err.message}` })] });
    }
  },
};