/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /24-7 - toggle 24/7 mode (stay in the voice channel).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { requireVoice } = require('../../music/voice');

module.exports = {
  data: new SlashCommandBuilder().setName('24-7').setDescription('Toggle 24/7 mode (stay in voice channel)'),
  async execute(interaction, client) {
    const vc = requireVoice(interaction, client);
    if (!vc.ok) return reply(interaction, vc.reply);

    let queue = client.music.getQueue(interaction.guild.id);
    if (!queue) {
      try {
        await client.music.ensureConnected(interaction.guild, vc.channel, { requestedBy: interaction.user.tag });
        queue = client.music.getQueue(interaction.guild.id);
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Could not connect: ${err.message}` })] });
      }
    }

    const enabled = client.music.toggle247(interaction.guild.id);
    return reply(interaction, {
      embeds: [successEmbed({ description: `24/7 mode **${enabled ? 'enabled' : 'disabled'}** — I ${enabled ? 'will stay' : 'will leave'} in the voice channel.` })],
    });
  },
};
