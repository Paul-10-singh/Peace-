/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /spotify - search & play Spotify via the Spotify extractor (bridged to a
 * streamable source automatically by discord-player).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, errorEmbed, successEmbed } = require('../../utils/decorations');
const { requireVoice } = require('../../music/voice');
const { formatDuration } = require('../../music/format');
const { postPanel } = require('../../music/nowPlaying');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spotify')
    .setDescription('Search & play music from Spotify')
    .addSubcommand((s) =>
      s.setName('search').setDescription('Search Spotify for a track')
        .addStringOption((o) => o.setName('query').setDescription('Track name').setRequired(true))
        .addBooleanOption((o) => o.setName('play').setDescription('Play the top result now'))
    ),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'search') {
      return search(interaction, client);
    }
    return reply(interaction, errorEmbed({ description: 'Unknown subcommand.' }));
  },
};

async function search(interaction, client) {
  await interaction.deferReply();
  const query = interaction.options.getString('query');
  const shouldPlay = interaction.options.getBoolean('play') ?? false;

  try {
    const player = client.music;
    let result;
    try {
      result = await player.search(query, { searchEngine: 'spotify' });
    } catch {
      try {
        result = await player.search(query, { searchEngine: 'spsearch' });
      } catch (err) {
        return interaction.editReply({ embeds: [errorEmbed({ description: `Spotify search failed: ${err.message}` })] });
      }
    }

    if (!result || !result.tracks?.length) {
      return interaction.editReply({ embeds: [errorEmbed({ description: 'No Spotify results found.' })] });
    }

    const top = result.tracks[0];
    // If play, join the voice and enqueue.
    if (shouldPlay) {
      const vc = requireVoice(interaction, client);
      if (!vc.ok) return interaction.editReply(vc.reply);
      const { track, queue } = await player.play(interaction.guild, vc.channel, top.url, interaction.user.tag);
      await interaction.editReply({
        embeds: [successEmbed({ description: `Playing **${track.title}**${track.author ? ` — ${track.author}` : ''}` })],
      });
      if (queue) await postPanel(client, queue, queue.metadata?.channel).catch(() => {});
      return;
    }

    const rows = result.tracks.slice(0, 5).map((r, i) => {
      const d = r.durationMS ? formatDuration(r.durationMS) : '—';
      return `**${i + 1}.** **${r.title}**${r.author ? ` — ${r.author}` : ''} \`${d}\``;
    });
    return interaction.editReply({
      embeds: [
        commandEmbed({
          title: 'Spotify Search',
          description: `Results for **${query}**:\n\n${rows.join('\n')}\n\n> Use \`/play <name or url>\` to play, or \`/spotify search play:true\``,
        }),
      ],
    });
  } catch (err) {
    console.error('[PeaceX] [Music] /spotify error:', err);
    return interaction.editReply({ embeds: [errorEmbed({ description: err.message })] });
  }
}
