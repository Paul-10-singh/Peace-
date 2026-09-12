/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /play - multi-platform playback (YouTube, Spotify, SoundCloud, Apple Music,
 * Deezer, direct URLs, playlists/albums, or plain search text).
 *
 * Behavior per spec:
 *  - URL -> resolves & queues directly (Components V2 confirmation).
 *  - Song name -> ephemeral Components V2 select of the top 5 results; picking
 *    one enqueues it. The picker is only visible to the /play requester.
 * The node metadata records sessionRequester so every later control is gated.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { requireVoice } = require('../../music/voice');
const { formatDuration, cleanTrackTitle } = require('../../music/format');
const { postPanel, setPanelRequester } = require('../../music/nowPlaying');
const { storePicks, v2Error } = require('../../music/interactions');

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music from YouTube, Spotify, SoundCloud, Apple Music & more')
    .addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Song name or URL (YouTube/Spotify/SoundCloud/Apple Music/Deezer)')
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('platform').setDescription('Prefer a specific platform for text searches').setRequired(false)
        .addChoices(
          { name: 'Auto', value: 'auto' },
          { name: 'YouTube', value: 'youtube' },
          { name: 'Spotify', value: 'spotify' },
          { name: 'SoundCloud', value: 'soundcloud' },
          { name: 'Apple Music', value: 'applemusic' }
        )
    ),

  async execute(interaction, client) {
    await interaction.deferReply();

    const vc = requireVoice(interaction, client);
    if (!vc.ok) return interaction.followUp(v2Error(vc.reply.content)).catch(() => {});

    const query = interaction.options.getString('query');
    const userId = interaction.user.id;
    const displayName = interaction.user.displayName || interaction.user.username;

    // ── URL: resolve & queue directly ─────────────────────────────────
    if (URL_RE.test(query.trim())) {
      try {
        const existingQueue = client.music.getQueue(interaction.guild.id);
        const wasPlaying = Boolean(existingQueue?.currentTrack);
        const { queue, track } = await withTimeout(
          client.music.play(interaction.guild, vc.channel, query.trim(), displayName, userId),
          25000,
          'Playback setup timed out. Please try again.'
        );
        const first = queue?.currentTrack ?? track;
        const dur = formatDuration(track.durationMS || first?.durationMS || 0);
        const c = new ContainerBuilder().setAccentColor(0x353535).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `🎧 **${wasPlaying ? 'Added to queue' : 'Now playing'}**\n${cleanTrackTitle(track.title)}${track.author ? ` — ${track.author}` : ''}\n\`${dur}\``
          )
        );
        if (queue) setPanelRequester(interaction.guild.id, userId);
        await interaction.followUp({ components: [c.toJSON()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        if (queue) await postPanel(client, queue, queue.metadata?.channel).catch(() => {});
        return;
      } catch (err) {
        console.error('[PeaceX] [Music] /play (URL) error:', err);
        return interaction.followUp(v2Error(`Could not play that: ${err.message}`)).catch(() => {});
      }
    }

    // ── Song name: ephemeral picker of the top 5 ─────────────────────
    const player = client.music.getPlayer();
    try {
      const result = await player.search(query, { searchEngine: 'auto' });
      const tracks = result?.tracks?.slice(0, 5);
      if (!tracks || !tracks.length) {
        return interaction.followUp(v2Error(`No results found for **${query}**`)).catch(() => {});
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId('music:pick')
        .setPlaceholder('Pick a result to play')
        .addOptions(
          tracks.map((t, i) => ({
            label: truncate(`${i + 1}. ${t.title}${t.author ? ` — ${t.author}` : ''}`, 100),
            value: String(i),
            description: t.duration ? `⏱ ${t.duration}` : undefined,
          }))
        );

      const container = new ContainerBuilder().setAccentColor(0x353535)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Top results for** \`${query}\`\nChoose one to start playing.`)
        )
        .addActionRowComponents(select);

      storePicks(userId, {
        mode: 'play',
        channelId: vc.channel.id,
        tracks: tracks.map((t) => ({
          title: t.title,
          url: t.url,
          author: t.author,
          durationMS: t.durationMS,
          duration: t.duration || formatDuration(t.durationMS),
        })),
      });

      return interaction.followUp({ components: [container.toJSON()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
    } catch (err) {
      console.error('[PeaceX] [Music] /play (search) error:', err);
      return interaction.followUp(v2Error(`Search failed: ${err.message}`)).catch(() => {});
    }
  },
};

function truncate(str, n) {
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}
