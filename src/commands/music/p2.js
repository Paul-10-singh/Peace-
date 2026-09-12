/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /p2 - play "Av2" from the local library.
 */
const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { requireVoice } = require('../../music/voice');
const { postPanel } = require('../../music/nowPlaying');

const FILE = path.join(__dirname, '..', '..', 'music', 'lib', 'Av2.mp3');
const NAME = 'Av2';

module.exports = {
  data: new SlashCommandBuilder().setName('p2').setDescription('Play the local library track Av2'),
  async execute(interaction, client) {
    await interaction.deferReply();
    const vc = requireVoice(interaction, client);
    if (!vc.ok) return reply(interaction, vc.reply);

    try {
      const music = client.music;
      const { track, queue } = await music.play(
        interaction.guild,
        vc.channel,
        FILE,
        interaction.user.displayName || interaction.user.username,
      );
      await reply(interaction, { embeds: [successEmbed({ title: `${NAME} playing`, description: `**${track.title}**` })] });
      if (queue) await postPanel(client, queue, queue.metadata?.channel).catch(() => {});
    } catch (err) {
      console.error('[PeaceX] [Music] /p2 error:', err);
      return reply(interaction, { embeds: [errorEmbed({ description: err.message })] });
    }
  },
};
