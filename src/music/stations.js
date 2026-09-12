/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Tamil radio station registry for /radio (24/7 live streaming).
 * URLs were verified live on 2026-09-09 (HTTP 200 + real audio frames).
 * A stream that stops working can be swapped here without any code change.
 */
const STATIONS = [
  { id: 'bigfm', name: 'Big FM Tamil', url: 'https://stream.zeno.fm/r2gn1pgm4qruv', codec: 'AAC' },
  { id: '90s', name: "90's Tamil Melodies", url: 'https://stream.zeno.fm/tqnws2eafwzuv.aac', codec: 'AAC' },
  { id: 'oldhits', name: 'Tamil Old Hits FM', url: 'https://a9oldhits-a9media.radioca.st/stream', codec: 'MP3' },
  { id: 'panpalai', name: 'Tamil Panpalai Gold', url: 'https://tamilpanpalai.radioca.st/ind', codec: 'MP3' },
  { id: '894', name: '89.4 Tamil FM', url: 'https://centova.aarenworld.com/proxy/894tamilfm/stream', codec: 'MP3' },
  { id: 'sooriyan', name: 'Sooriyan FM', url: 'https://radio.lotustechnologieslk.net:8006/;stream.mp3', codec: 'MP3' },
  { id: 'minnal', name: 'Minnal FM', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/MINNAL_FMAAC.aac', codec: 'AAC' },
  { id: 'shakthi', name: 'Shakthi FM', url: 'https://mbc.thestreamtech.com:8086/stream', codec: 'AAC+' },
  { id: 'amuthu', name: 'Tamil Amuthu Radio', url: 'https://stream.zeno.fm/p88vvwd0gm0uv', codec: 'MP3' },
];

function stationById(id) {
  return STATIONS.find((s) => s.id === id) || null;
}

module.exports = { STATIONS, stationById };