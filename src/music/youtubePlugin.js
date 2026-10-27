/*
 * Peace✘ - YouTube Info Extractor Plugin for DisTube v5
 * Developed by Smith.Code
 *
 * Resolves YouTube URLs (watch, youtu.be, shorts, embeds) using YouTube's public oEmbed metadata
 * without requiring yt-dlp binaries or triggering YouTube's datacenter IP bot detection.
 * Stream playback is handled seamlessly via SoundCloud / Direct audio fallback.
 */
const { InfoExtractorPlugin, Song } = require('distube');

class YouTubePlugin extends InfoExtractorPlugin {
  constructor() {
    super();
  }

  validate(url) {
    if (typeof url !== 'string') return false;
    return (
      /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=|(?:shorts)\/))([\w-]{11})/i.test(url) ||
      /youtube\.com\/playlist\?list=([\w-]+)/i.test(url)
    );
  }

  async resolve(url, options = {}) {
    const videoMatch = url.match(
      /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=|(?:shorts)\/))([\w-]{11})/i
    );
    const videoId = videoMatch ? videoMatch[1] : null;

    let title = videoId ? `YouTube Track (${videoId})` : 'YouTube Audio';
    let uploaderName = '';
    let thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined;

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.title) title = data.title;
        if (data.author_name) uploaderName = data.author_name;
        if (data.thumbnail_url) thumbnail = data.thumbnail_url;
      }
    } catch {
      // Offline fallback: retains extracted title/thumbnail
    }

    return new Song(
      {
        plugin: this,
        source: 'youtube',
        playFromSource: false,
        id: videoId || url,
        name: title,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : url,
        thumbnail,
        uploader: { name: uploaderName },
      },
      options
    );
  }

  createSearchQuery(song) {
    if (song.uploader?.name && !song.name.toLowerCase().includes(song.uploader.name.toLowerCase())) {
      return `${song.name} ${song.uploader.name}`;
    }
    return song.name;
  }

  getRelatedSongs() {
    return [];
  }
}

module.exports = { YouTubePlugin };
