/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /stop - make the bot leave the voice channel and stop music playback.
 * While 24/7 mode is active (/247) the bot stops music but refuses to leave VC — only `/247 mode: end` (owner) frees it.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { get } = require('../../utils/settings');
const { destroyConnection } = require('../../utils/voice247');

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop music playback and leave the voice channel'),
  async execute(interaction, client) {
    const guild = interaction.guild;
    const me = guild?.members?.me;
    if (!guild || !me) return reply(interaction, { embeds: [errorEmbed({ description: 'This command can only be used inside a server.' })], ephemeral: true });

    const distube = client?.distube || interaction.client?.distube;
    if (distube) {
      try {
        const queue = distube.getQueue(guild.id);
        if (queue) queue.stop();
      } catch {}
    }

    const { channelId } = get(guild.id, 'vc247');
    if (channelId) {
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Playback Stopped', description: `Music stopped. Bot remains in <#${channelId}> because **24/7 mode** is enabled.` })],
      });
    }

    if (!me.voice?.channelId) {
      return reply(interaction, { embeds: [successEmbed({ description: 'Stopped music playback.' })] });
    }

    try {
      await me.voice.disconnect('Stopped by user');
      destroyConnection(guild);
      return reply(interaction, { embeds: [successEmbed({ description: 'Stopped music and left the voice channel.' })] });
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Could not disconnect: ${err.message}` })], ephemeral: true });
    }
  },
};
