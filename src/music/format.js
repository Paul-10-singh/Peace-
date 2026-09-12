/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Small formatting helpers shared by the music commands (avoid the main
 * helpers.js circular dependency with decorations).
 */

function formatDuration(msInput) {
  if (msInput == null || isNaN(msInput)) return '0:00';
  const ms = Number(msInput);
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function cleanTrackTitle(title) {
  if (!title) return 'Untitled';
  let clean = String(title).replace(/\s+/g, ' ').trim();
  clean = clean.split(/\s+\|\s+/)[0];
  clean = clean.replace(/\s*\((?:official\s+)?(?:music\s+)?video\)\s*$/i, '');
  clean = clean.replace(/\s*\[(?:official\s+)?(?:music\s+)?video\]\s*$/i, '');
  clean = clean.replace(/\s*[-|]\s*(?:official|lyrical|music\s+video|video\s+song|full\s+song).*$/i, '');
  clean = clean.replace(/\s*\((?:with|feat\.?|ft\.?)[^)]*\)/gi, '');
  clean = clean.replace(/\s+(?:official|lyrical|audio|video|4k|8k|hd)$/i, '');
  return clean.trim() || 'Untitled';
}

function formatTrack(track) {
  const dur = track.durationMS ? formatDuration(track.durationMS) : '∞';
  return `**${cleanTrackTitle(track.title)}**${track.author ? ` — ${track.author}` : ''} \`${dur}\``;
}

module.exports = { formatDuration, formatTrack, cleanTrackTitle };
