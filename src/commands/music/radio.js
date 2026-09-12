/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /radio - play a Tamil radio station 24/7 (stays in the voice channel,
 * re-plays the same live stream on any hiccup so it never drops). Running the
 * command again on an active station stops it and disconnects.
 * The station list lives in src/music/stations.js.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, successEmbed, errorEmbed } = require('../../utils/decorations');
const { requireVoice } = require('../../music/voice');
const { STATIONS, stationById } = require('../../music/stations');
const { setPanelRequester } = require('../../music/nowPlaying');

const STATION_CHOICES = STATIONS.map((s) => ({ name: `${s.name} (${s.codec})`, value: s.id }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Play a Tamil radio station 24/7 (use again to stop)')
    .addStringOption((o) =>
      o
        .setName('station')
        .setDescription('Pick a Tamil radio station')
        .setRequired(true)
        .addChoices(...STATION_CHOICES)
    ),
  async execute(interaction, client) {
    const vc = requireVoice(interaction, client);
    if (!vc.ok) return reply(interaction, vc.reply);

    const guildId = interaction.guild.id;
    if (client.music.isRadioActive(guildId)) {
      client.music.stop(guildId);
      client.music.leave(guildId);
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Radio stopped', description: '📻 Live radio turned off and I left the voice channel.' })],
      });
    }

    const station = stationById(interaction.options.getString('station'));
    if (!station) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Unknown station.' })], ephemeral: true });
    }

    try {
      const track = {
        url: station.url,
        title: station.name,
        author: 'Live Radio',
        durationMS: 0,
        thumbnail: null,
        source: 'radio',
        requestedBy: interaction.user.displayName || interaction.user.username,
        sessionRequester: interaction.user.id,
      };
      await client.music.startRadio(interaction.guild, vc.channel, track);
      setPanelRequester(guildId, interaction.user.id);

      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: '📻 Live Radio',
            description:
              `**${station.name}** (${station.codec}) is now playing 24/7.\n` +
              `Run \`/radio\` again anytime to stop it.\n\n` +
              '_Streaming live now — volume, pause, filters & the card buttons all work._',
            extra: '24/7 mode + loop are on, so it never stops.',
          }),
        ],
      });
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Radio start failed: ${err.message}` })] });
    }
  },
};