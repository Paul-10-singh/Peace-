/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Now-playing image card (ported from the Peace✘ᴾᴿᴼ custom UI).
 * Renders a generated PNG card showing the current track artwork, title,
 * artist, a live progress bar and time stamps — the exact "custom UI" style
 * the Pro build ships (musicard-quartz "quartz+" theme).
 *
 * Falls back to null on any build failure so music playback is never blocked
 * by a card-rendering problem.
 */
const { formatDuration, cleanTrackTitle } = require('./format');

let musicardReady;

function loadMusicard() {
  if (!musicardReady) {
    musicardReady = import('musicard').then(async (module) => {
      await module.initializeFonts();
      return module.Ease;
    });
  }
  return musicardReady;
}

/** Best-effort 720p thumbnail for a nicer card (Pro swaps hqdefault->maxresdefault). */
function bestThumb(url) {
  if (!url) return null;
  if (typeof url !== 'string') return null;
  return url.replace('hqdefault', 'maxresdefault');
}

function trackThumb(track) {
  const direct = bestThumb(track?.thumbnail);
  if (direct) return direct;
  const match = String(track?.url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  return match ? `https://i.ytimg.com/vi/${match[1]}/maxresdefault.jpg` : null;
}

function toClock(ms) {
  if (!ms) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Generate the now-playing card PNG for a queue.
 * @returns {Promise<Buffer|null>}
 */
async function renderCard(queue) {
  try {
    const track = queue?.currentTrack;
    if (!track) return null;

    const thumb = trackThumb(track);
    const totalMs = track.durationMS || 0;

    let currentMs = 0;
    try {
      currentMs = queue._sess?.audioPlayer?.state?.playbackDuration ?? 0;
    } catch {
      /* ignore */
    }
    if (currentMs > totalMs) currentMs = totalMs;
    const progress = totalMs > 0 ? Math.min(1, currentMs / totalMs) : 0;

    const Ease = await loadMusicard();
    return await Ease({
      trackName: cleanTrackTitle(track.title),
      artistName: track.author || 'Unknown Artist',
      albumArt: thumb || 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      fallbackArt: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      timeAdjust: {
        timeStart: toClock(currentMs),
        timeEnd: totalMs ? toClock(totalMs) : '∞',
      },
      progressBar: progress * 100,
      volumeBar: queue.node.volume ?? 70,
      backgroundColor: '#101312',
      styleConfig: {
        trackStyle: { textColor: '#ffffff', textGlow: false, textItalic: false },
        artistStyle: { textColor: '#d1d5db', textGlow: false, textItalic: false },
        timeStyle: { textColor: '#e5e7eb', textGlow: false, textItalic: false },
        progressBarStyle: { barColor: '#53d769', barColorDuo: false },
        volumeBarStyle: { barColor: '#53d769', barColorDuo: false },
      },
    });
  } catch (err) {
    console.error('[PeaceX] [Card] render failed:', err?.message);
    return null;
  }
}

module.exports = { renderCard, formatDuration };
