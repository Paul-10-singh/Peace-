/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /disconnect - disconnect the bot from voice (admin-only).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { clearPanel } = require('../../music/nowPlaying');

module.exports = {
  data: new SlashCommandBuilder().setName('disconnect').setDescription('Disconnect the bot from the voice channel'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (queue) {
      clearPanel(interaction.guild.id);
      queue.delete();
    }
    const member = interaction.guild?.members?.me;
    const vc = member?.voice?.channel;
    try {
      await member.voice.disconnect();
    } catch {}
    return reply(interaction, { embeds: [successEmbed({ description: vc ? `Left <#${vc.id}>` : 'Disconnected from voice.' })] });
  },
};
