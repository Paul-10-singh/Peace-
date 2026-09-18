/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /disconnect - make the bot leave the voice channel.
 * While 24/7 mode is active (/247) the bot refuses and shows a warning
 * instead — only `/247 mode: end` (owner) frees it.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { get } = require('../../utils/settings');
const { destroyConnection } = require('../../utils/voice247');

module.exports = {
  data: new SlashCommandBuilder().setName('disconnect').setDescription('Disconnect the bot from the voice channel'),
  async execute(interaction) {
    const guild = interaction.guild;
    const me = guild?.members?.me;
    if (!guild || !me) return reply(interaction, { embeds: [errorEmbed({ description: 'This command can only be used inside a server.' })], ephemeral: true });

    const { channelId } = get(guild.id, 'vc247');
    if (channelId) {
      return reply(interaction, {
        embeds: [errorEmbed({ title: '24/7 mode is on', description: `This bot is in **24/7 mode** and won't disconnect.<#${channelId}> To free it, an owner must run \`/247 mode: end\`.` })],
      });
    }

    if (!me.voice?.channelId) return reply(interaction, { embeds: [errorEmbed({ description: 'I am not in a voice channel right now.' })], ephemeral: true });
    try {
      await me.voice.disconnect('Disconnected by user');
      destroyConnection(guild);
      return reply(interaction, { embeds: [successEmbed({ description: 'Disconnected — I left the voice channel.' })] });
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Could not disconnect: ${err.message}` })], ephemeral: true });
    }
  },
};