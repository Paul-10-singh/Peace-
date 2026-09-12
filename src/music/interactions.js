/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Central router for every `music:*` component interaction (buttons + selects).
 *
 * Rules enforced here:
 *  - Strict requester gate: only the original /play requester may use controls
 *    ("These controls aren't yours.") — matches the build spec.
 *  - Components V2 only: all replies set MessageFlags.IsComponentsV2 and never
 *    mix a content field or legacy embeds on the same message.
 *  - Empty-queue guards: like/dislike/filter with no active track replies an
 *    ephemeral error instead of crashing.
 */
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

const store = require('./store');
const { cleanTrackTitle } = require('./format');
const { getPanelRequester, setPanelRequester, refreshPanel } = require('./nowPlaying');
const { buildControlsPayload } = require('./controls');

// Pending track picks produced by /play (ephemeral select): userId -> payload.
const picks = new Map();

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function v2Error(text) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(text)
  );
  return { components: [container.toJSON()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

/** Resolve the current requester display tag for the controls panel. */
function requesterTag(queue) {
  return queue?.metadata?.requestedBy || 'someone';
}

/** Register pending search results for a /play picker. */
function storePicks(userId, data) {
  picks.set(userId, data);
}

async function enqueuePick(interaction, client, pending) {
  const { channelId, tracks, pickedIndex, mode } = pending;
  const track = tracks[pickedIndex];
  if (!track) {
    return interaction.reply(v2Error('That selection no longer exists.')).catch(() => {});
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const title = cleanTrackTitle(track.title);
  await interaction.editReply(v2Error(`⏳ Starting **${title}**...`)).catch(() => {});

  // ── "add" mode: save to the user's global playlist (no playback) ──
  if (mode === 'add') {
    const res = store.addTrack(interaction.user.id, {
      title: track.title,
      url: track.url,
      duration: track.duration,
    });
    if (res.duplicate) {
      return interaction.editReply(v2Error(`**${title}** is already in your playlist.`)).catch(() => {});
    }
    return interaction.editReply(v2Error(`❤️ Added **${title}** to your global playlist.`)).catch(() => {});
  }

  // ── "play" mode: enqueue & start ───────────────────────────────────
  const channel = interaction.guild.channels.cache.get(channelId) || null;
  if (!channel) {
    return interaction.editReply(v2Error('That voice channel is gone — rejoin and run /play again.')).catch(() => {});
  }
  try {
    const existingQueue = client.music.getQueue(interaction.guild.id);
    const wasPlaying = Boolean(existingQueue?.currentTrack);
    await withTimeout(
      client.music.play(interaction.guild, channel, track.url, interaction.user.displayName || interaction.user.username, interaction.user.id),
      25000,
      'Playback setup timed out. Please try again.'
    );
    const queue = client.music.getQueue(interaction.guild.id);
    if (queue) setPanelRequester(interaction.guild.id, interaction.user.id);
    await interaction.editReply(v2Error(`🎧 ${wasPlaying ? `Added to queue **${title}**` : `Now playing **${title}**`}`)).catch(() => {});
    const { postPanel } = require('./nowPlaying');
    postPanel(client, queue, queue?.metadata?.channel).catch(() => {});
    return;
  } catch (err) {
    console.error('[PeaceX] [Music] pick enqueue error:', err);
    return interaction.editReply(v2Error(`Could not play that: ${err.message}`)).catch(() => {});
  }
}

async function handleMusicComponent(interaction, client) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const value = parts[2];

  // ── Pick select from /play (ephemeral to the requester) ─────────────
  if (action === 'pick') {
    const pending = picks.get(userId);
    const pickedIndex = pending ? Number(interaction.values?.[0]) : NaN;
    if (!pending || !Number.isInteger(pickedIndex) || !pending.tracks[pickedIndex]) {
      return interaction.reply(v2Error('That pick expired — run /play again.')).catch(() => {});
    }
    picks.delete(userId);
    return enqueuePick(interaction, client, { ...pending, pickedIndex });
  }

  const queue = client.music.getQueue(guildId);

  // ── Strict requester gate on every other control ────────────────────
  const requesterId = getPanelRequester(guildId) || queue?.metadata?.sessionRequester || null;
  if (requesterId && userId !== requesterId) {
    return interaction.reply(v2Error("These controls aren't yours.")).catch(() => {});
  }

  // Actions that live on the ephemeral controls panel (updated in place).
  const panelActions = new Set(['vol+', 'vol-', 'mute', 'repeat', 'shuf']);

  // ── Pro now-playing image-card transport buttons ────────────────────
  if (action === 'pro-pause' || action === 'pro-resume' || action === 'pro-skip' || action === 'pro-stop' || action === 'pro-loop' || action === 'pro-shuffle') {
    if (!queue || !queue.currentTrack) {
      return interaction.reply(v2Error('Nothing is playing right now.')).catch(() => {});
    }
    if (action === 'pro-pause') {
      await queue.node.pause().catch(() => {});
    } else if (action === 'pro-resume') {
      await queue.node.resume().catch(() => {});
    } else if (action === 'pro-skip') {
      await interaction.deferUpdate().catch(() => {});
      queue.node.skip();
      await new Promise((r) => setTimeout(r, 300));
      await refreshPanel(client, guildId).catch(() => {});
      return;
    } else if (action === 'pro-stop') {
      await interaction.deferUpdate().catch(() => {});
      const wasRadio = client.music.isRadioActive(guildId);
      client.music.stop(guildId);
      if (wasRadio) {
        // Radio runs 24/7 by design — stopping it should release the channel.
        client.music.toggle247(guildId);
        client.music.leave(guildId);
      }
      await refreshPanel(client, guildId).catch(() => {});
      return;
    } else if (action === 'pro-loop') {
      client.music.cycleRepeat(guildId);
    } else if (action === 'pro-shuffle') {
      queue.tracks.shuffle();
    }
    await interaction.deferUpdate().catch(() => {});
    await refreshPanel(client, guildId).catch(() => {});
    return;
  }

  // Filter select lives on the standalone Filters panel: apply + ack the select.
  if (action === 'filter') {
    if (!queue || !queue.currentTrack) {
      return interaction.reply(v2Error('Nothing is playing right now.')).catch(() => {});
    }
    const preset = interaction.values?.[0] || value;
    if (preset === 'off') {
      await queue.filters.setFilters(false).catch(() => {});
    } else {
      client.music.setFilter(guildId, preset);
    }
    await interaction.deferUpdate().catch(() => {});
    await refreshPanel(client, guildId).catch(() => {});
    return;
  }

  // Actions on the public card (acknowledge, then re-render the card).
  if (action === 'prev' || action === 'toggle' || action === 'next') {
    if (!queue || !queue.currentTrack) {
      return interaction.reply(v2Error('Nothing is playing right now.')).catch(() => {});
    }
    await interaction.deferUpdate().catch(() => {});
    if (action === 'prev') {
      if (queue.history?.previousTrack) queue.history.previous();
    } else if (action === 'toggle') {
      if (queue.node.isPaused()) queue.node.resume();
      else queue.node.pause();
    } else {
      queue.node.skip();
      await new Promise((r) => setTimeout(r, 300));
    }
    await refreshPanel(client, guildId).catch(() => {});
    return;
  }

  if (action === 'controls') {
    if (!requesterId) setPanelRequester(guildId, userId);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    const payload = await buildControlsPayload(queue || null, requesterTag(queue));
    delete payload.flags;
    return interaction.editReply(payload).catch(() => {});
  }

  // Filters button on the card: open an in-channel select of audio presets.
  if (action === 'filters') {
    if (!queue || !queue.currentTrack) {
      return interaction.reply(v2Error('Nothing is playing right now.')).catch(() => {});
    }
    return interaction.reply(buildFiltersPayload(queue)).catch(() => {});
  }

  // Like / Dislike on the public card -> store action + ack + refresh card.
  if (action === 'like' || action === 'dislike') {
    if (!queue || !queue.currentTrack) {
      return interaction.reply(v2Error('Nothing is playing right now.')).catch(() => {});
    }
    const t = queue.currentTrack;
    let label;
    if (action === 'like') {
      const res = store.addTrack(userId, {
        title: t.title,
        url: t.url,
        duration: formatDurationSec(t.durationMS),
      });
      label = res.duplicate ? `**${t.title}** is already in your playlist.` : `❤️ Added **${t.title}** to your playlist.`;
    } else {
      store.removeTrack(userId, t.url);
      label = `👎 Removed **${t.title}** from your playlist.`;
    }
    await interaction.deferUpdate().catch(() => {});
    await interaction.followUp({ ...v2Msg(label), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
    await refreshPanel(client, guildId).catch(() => {});
    return;
  }

  if (panelActions.has(action)) {
    // All panel actions need an active track (Amendment 3: no crash).
    if (!queue || !queue.currentTrack) {
      return interaction.reply(v2Error('Nothing is playing right now.')).catch(() => {});
    }

    switch (action) {
      case 'vol+':
      case 'vol-': {
        const v = queue.node.volume ?? 70;
        queue.node.setVolume(Math.max(0, Math.min(200, v + (action === 'vol+' ? 10 : -10))));
        break;
      }
      case 'mute': {
        const v = queue.node.volume ?? 70;
        queue.node.setVolume(v > 0 ? 0 : 70);
        break;
      }
      case 'repeat': {
        client.music.cycleRepeat(guildId);
        break;
      }
      case 'shuf': {
        queue.tracks.shuffle();
        break;
      }
    }

    try {
      await interaction.deferUpdate();
      const payload = await buildControlsPayload(queue, requesterTag(queue));
      delete payload.flags;
      await interaction.editReply(payload);
    } catch (e) {
      /* if the ephemeral panel expired, fall back to a fresh reply */
      try {
        await interaction.reply(await buildControlsPayload(queue, requesterTag(queue)));
      } catch {
        /* ignore */
      }
    }
    await refreshPanel(client, guildId).catch(() => {});
    return;
  }

  // Unknown action — acknowledge silently.
  return interaction.deferUpdate().catch(() => {});
}

function formatDurationSec(ms) {
  if (!ms) return null;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function v2Msg(text) {
  const container = new ContainerBuilder().setAccentColor(0x353535).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(text)
  );
  return { components: [container.toJSON()], flags: MessageFlags.IsComponentsV2 };
}

const FILTER_CHOICES = [
  { label: 'Off (clear)', value: 'off' },
  { label: '8D', value: '8d' },
  { label: 'Bassboost', value: 'bassboost' },
  { label: 'Nightcore', value: 'nightcore' },
  { label: 'Vaporwave', value: 'vaporwave' },
  { label: 'Lofi', value: 'lofi' },
  { label: 'Surround', value: 'surround' },
  { label: 'Subboost', value: 'subboost' },
  { label: 'Karaoke', value: 'karaoke' },
];

/** Filters button -> an in-channel select of audio presets. */
function buildFiltersPayload(queue) {
  const current = queue?.currentTrack;
  const container = new ContainerBuilder()
    .setAccentColor(0x353535)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(current ? `🎚️ **Audio Filters** for **${current.title}**` : '🎚️ **Audio Filters**')
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new StringSelectMenuBuilder()
        .setCustomId('music:filter')
        .setPlaceholder('Choose an audio filter')
        .addOptions(FILTER_CHOICES)
    );
  return { components: [container.toJSON()], flags: MessageFlags.IsComponentsV2 };
}

module.exports = { handleMusicComponent, storePicks, v2Error };
