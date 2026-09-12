const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mix')
    .setDescription('Play a track with a side sound mixed over it')
    .addStringOption((o) => o.setName('track').setDescription('Track name or URL').setRequired(true))
    .addStringOption((o) => o.setName('side_sound').setDescription('Direct audio URL for the side sound').setRequired(true)),
  async execute(interaction, client) {
    const sideSound = interaction.options.getString('side_sound');
    if (!/^https?:\/\//i.test(sideSound)) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'The side sound must be a direct HTTP(S) audio URL.' })], ephemeral: true });
    }
    const { requireVoice } = require('../../music/voice');
    const vc = requireVoice(interaction, client);
    if (!vc.ok) return reply(interaction, vc.reply);
    try {
      const result = await client.music.play(
        interaction.guild,
        vc.channel,
        interaction.options.getString('track'),
        interaction.user.displayName || interaction.user.username,
        null,
        { mixUrl: sideSound },
      );
      return reply(interaction, { embeds: [successEmbed({ title: 'Mix playing', description: `**${result.track.title}** with side audio.` })] });
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Mix failed: ${err.message}` })], ephemeral: true });
    }
  },
};