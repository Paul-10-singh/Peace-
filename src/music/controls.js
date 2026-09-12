/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Private per-user controls panel (ephemeral, Components V2).
 *
 * Opened from the ▶ Controls button on the public now-playing card. Because
 * every music control is requester-only (strict), this panel is only ever
 * shown to the original /play requester; it carries volume / mute / repeat /
 * shuffle / filters and the per-user global playlist ❤️ like / 👎 dislike.
 *
 * All payloads set MessageFlags.IsComponentsV2 and never include a content
 * field or legacy embeds on the same message.
 */
const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { QueueRepeatMode } = require('./player');
const { renderCard } = require('./card');
const path = require('path');

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

/** Build the themed ephemeral controls payload for a requester + queue. */
async function buildControlsPayload(queue, requesterTag) {
  let paused = queue?.node?.isPaused?.() ?? false;
  let volume = queue?.node?.volume ?? 70;

  const repeatLabel =
    queue && queue.repeatMode === QueueRepeatMode.TRACK
      ? 'Repeat: Track'
      : queue && queue.repeatMode === QueueRepeatMode.QUEUE
        ? 'Repeat: Queue'
        : 'Repeat: Off';

  const current = queue?.currentTrack;

  const card = await renderCard(queue);
  const files = [];
  let image = null;
  if (card) {
    const imageName = `controls-music-${Date.now()}.png`;
    files.push(new AttachmentBuilder(card, { name: imageName }));
    image = `attachment://${imageName}`;
  } else {
    const logo = path.join(__dirname, '..', 'assets', 'icons', 'music', 'Now Playing.gif');
    files.push(new AttachmentBuilder(logo, { name: 'music-theme.gif' }));
    image = 'attachment://music-theme.gif';
  }

  const embed = new EmbedBuilder()
    .setTitle('🎵 Music Controls')
    .setDescription(
      `${current ? `**${current.title}**${current.author ? `\n${current.author}` : ''}` : 'Nothing is currently playing.'}\n` +
      `\n▶️ **${paused ? 'Paused' : 'Playing'}** · 🔊 **${volume}%**\nRequested by **${requesterTag || 'someone'}**`
    )
    .setImage(image)
    .setFooter({ text: 'Peace✘ Music · Use the controls below' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music:prev').setLabel('Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music:toggle').setLabel(paused ? 'Resume' : 'Pause').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('music:next').setLabel('Skip').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music:pro-stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music:vol-').setLabel('−10%').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music:mute').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music:vol+').setLabel('+10%').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music:repeat').setLabel(repeatLabel).setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music:pro-loop').setLabel('Loop').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music:shuf').setLabel('Shuffle').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music:like').setLabel('Like').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('music:dislike').setLabel('Dislike').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('music:filter').setPlaceholder('Select Filter').addOptions(FILTER_CHOICES)
    ),
  ];

  return { embeds: [embed], files, components: rows, flags: MessageFlags.Ephemeral };
}

function queuestate(queue) {
  if (!queue?.currentTrack) return 'idle';
  const t = queue.currentTrack;
  return (t.author ? `${t.title} — ${t.author}` : t.title).slice(0, 80);
}

module.exports = { buildControlsPayload };
