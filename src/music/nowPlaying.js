/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Now-playing card — Pro custom-UI style.
 *
 * Each track start renders a generated PNG music card (see ./card.js) and posts
 * it to the voice/text channel as a message with a row of transport buttons
 * (pause/resume, skip, stop, loop, shuffle) plus the standard Controls /
 * Filters / Like / Dislike buttons. The message reference is kept in a per-guild
 * registry so button presses and track changes refresh it in place.
 *
 * Every control button is requester-only (strict): users who are not the
 * original /play requester are told the controls aren't theirs.
 */
const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { QueueRepeatMode } = require('./player');
const { formatDuration, cleanTrackTitle } = require('./format');
const { renderCard } = require('./card');

// per-guild: { message, guildId, channelId, requesterId }
const panels = new Map();
const panelOperations = new Map();
const refreshJobs = new Map();

const CONTROL_IDS = {
  pause: 'music:pro-pause',
  resume: 'music:pro-resume',
  skip: 'music:pro-skip',
  stop: 'music:pro-stop',
  loop: 'music:pro-loop',
  shuffle: 'music:pro-shuffle',
};

/** Registry helper: requester id used to gate every music button (strict). */
function getPanelRequester(guildId) {
  return panels.get(guildId)?.requesterId ?? null;
}

/** Pro-style transport row: pause/resume, skip, stop, loop, shuffle. */
function transportRow(queue) {
  const paused = queue?.node?.isPaused?.() ?? false;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(paused ? CONTROL_IDS.resume : CONTROL_IDS.pause)
      .setLabel(paused ? 'Resume' : 'Pause')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(CONTROL_IDS.skip).setLabel('Skip').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CONTROL_IDS.stop).setLabel('Stop').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CONTROL_IDS.loop).setLabel('Loop').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CONTROL_IDS.shuffle).setLabel('Shuffle').setStyle(ButtonStyle.Secondary)
  );
}

/** Controls and feedback row shown below the now-playing card. */
function controlsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music:controls').setLabel('Controls').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music:like').setLabel('Like').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('music:dislike').setLabel('Dislike').setStyle(ButtonStyle.Secondary)
  );
}

/** Pro-style filter dropdown (EQ presets) rendered on the card itself. */
function filterSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('music:filter')
      .setPlaceholder('🎛️ Select Filter')
      .addOptions([
        { label: 'Reset Filters', value: 'off', emoji: '🔃' },
        { label: 'BassBoost', value: 'bassboost', emoji: '🔊' },
        { label: '8D', value: '8d', emoji: '🌀' },
        { label: 'NightCore', value: 'nightcore', emoji: '🌙' },
        { label: 'Lofi', value: 'lofi', emoji: '🎶' },
        { label: 'Vaporwave', value: 'vaporwave', emoji: '✨' },
        { label: 'Slow', value: 'slow', emoji: '🐢' },
        { label: 'Tremolo', value: 'tremolo', emoji: '〰️' },
        { label: 'Vibrato', value: 'vibrato', emoji: '🎵' },
        { label: 'Surround', value: 'surround', emoji: '🔊' },
        { label: 'Subboost', value: 'subboost', emoji: '🔋' },
        { label: 'Karaoke', value: 'karaoke', emoji: '🎤' },
        { label: 'Mono', value: 'mono', emoji: '〽️' },
        { label: 'Normalizer', value: 'normalizer', emoji: '⚖️' },
        { label: 'Compressor', value: 'compressor', emoji: '🗜️' },
      ])
  );
}

function loopEmoji(queue) {
  if (queue?.repeatMode === QueueRepeatMode.TRACK) return '🔂';
  if (queue?.repeatMode === QueueRepeatMode.QUEUE) return '🔁';
  return '🔁';
}

/** Serialize Discord panel requests so rapid commands cannot race each other. */
function enqueuePanelOperation(guildId, operation) {
  const previous = panelOperations.get(guildId) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(operation)
    .catch(() => null);
  panelOperations.set(guildId, current);
  current.finally(() => {
    if (panelOperations.get(guildId) === current) panelOperations.delete(guildId);
  }).catch(() => {});
  return current;
}

/** Build the full message payload for a guild queue (embed + card image + buttons). */
async function buildPayload(client, queue) {
  if (!queue?.currentTrack) return null;
  const card = await renderCard(queue);
  const track = queue.currentTrack;

  const total = track.durationMS ? formatDuration(track.durationMS) : '∞';
  let currentMs = null;
  try {
    currentMs = queue._sess?.audioPlayer?.state?.playbackDuration ?? null;
  } catch {
    /* ignore */
  }
  const progress = currentMs != null ? formatDuration(currentMs) : '0:00';
  const title = cleanTrackTitle(track.title);

  const loopIcon = loopEmoji(queue);
  const paused = queue.node.isPaused() ? '⏸️ paused' : '▶️ playing';
  const volume = queue.node.volume ?? 70;

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Now Playing', iconURL: client?.user?.displayAvatarURL?.({ dynamic: true }) || undefined })
    .setDescription(
      `[**${title}**](${track.url || '#'})${track.author ? ` — **${track.author}**` : ''}\n` +
        `\`${progress} / ${total}\` ${paused} ${loopIcon}\n` +
        `🔊 Volume \`${volume}%\` · Requested by **${track.requestedBy || 'someone'}**`
    )
    .setFooter({ text: `Peace✘ · ${track.url ? 'Music' : 'Local track'}` });

  if (card) {
    const imageName = `music-card-${queue.guild.id}-${Date.now()}.png`;
    const attachment = new AttachmentBuilder(card, { name: imageName });
    embed.setImage(`attachment://${imageName}`);
    return {
      embeds: [embed],
      files: [attachment],
      components: [controlsRow()],
    };
  }

  // No card renderable -> graceful fallback with thumbnail only.
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return {
    embeds: [embed],
    components: [controlsRow()],
  };
}

/** Post (or update) the now-playing card for a guild. Returns the message. */
async function postPanel(client, queue, channel) {
  const guildId = queue?.guild?.id;
  if (!guildId) return null;
  return enqueuePanelOperation(guildId, async () => {
    const payload = await buildPayload(client, queue);
    if (!payload) return null;
    const existing = panels.get(guildId);
    if (existing?.message && !existing.message.deleted) {
      try {
        await existing.message.edit(payload);
        return existing.message;
      } catch {
        /* fall through to repost */
      }
    }
    const target = channel || queue.metadata?.channel;
    if (!target || typeof target.send !== 'function') return null;
    const msg = await target.send(payload).catch(() => null);
    if (msg) {
      panels.set(guildId, {
        guildId,
        message: msg,
        channelId: target.id,
        requesterId: queue.metadata?.sessionRequester ?? null,
      });
    }
    return msg;
  });
}

/** Refresh the stored card (used by buttons / track change). */
async function refreshPanel(client, guildId) {
  const active = refreshJobs.get(guildId);
  if (active) {
    active.pending = true;
    return active.promise;
  }

  const job = { pending: false, promise: null };
  job.promise = (async () => {
    do {
      job.pending = false;
      await enqueuePanelOperation(guildId, async () => {
        const queue = client.music?.getQueue(guildId);
        if (!queue || !queue.currentTrack) {
          panels.delete(guildId);
          return;
        }
        const existing = panels.get(guildId);
        if (!existing?.message || existing.message.deleted) return;
        const payload = await buildPayload(client, queue);
        if (payload) await existing.message.edit(payload).catch(() => {});
      });
    } while (job.pending);
  })().catch(() => {});
  refreshJobs.set(guildId, job);
  job.promise.finally(() => {
    if (refreshJobs.get(guildId) === job) refreshJobs.delete(guildId);
  }).catch(() => {});
  return job.promise;
}

/** Record/refresh the session requester on the panel registry. */
function setPanelRequester(guildId, requesterId) {
  const entry = panels.get(guildId);
  if (entry) {
    entry.requesterId = requesterId;
  } else {
    panels.set(guildId, { guildId, message: null, channelId: null, requesterId });
  }
}

/** Remove the stored card for a guild (e.g. on stop/leave). */
function clearPanel(guildId) {
  panels.delete(guildId);
}

module.exports = {
  buildPayload,
  controlsRow,
  refreshPanel,
  postPanel,
  clearPanel,
  buildPanel: async (client, queue, { semi }) => buildPayload(client, queue),
  getPanelRequester,
  setPanelRequester,
  CONTROL_IDS,
};
