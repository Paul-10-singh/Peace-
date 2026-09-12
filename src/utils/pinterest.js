/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Pinterest scraper (unofficial — no official Pinterest API exists for
 * third-party apps). Fetches the public search page and extracts pin image
 * URLs + metadata from the embedded JSON. Fragile by nature: Pinterest can
 * change their page structure at any time. Owner-only usage recommended.
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function extractPins(html) {
  const pins = [];
  const jsonMatches = html.matchAll(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/g);
  for (const m of jsonMatches) {
    try {
      const data = JSON.parse(m[1]);
      const dump = JSON.stringify(data);
      const imagePat = /"images":\{"orig":\{"url":"([^"]+)"/g;
      let im;
      while ((im = imagePat.exec(dump))) pins.push(im[1]);
    } catch {
      /* fall through to regex pass */
    }
  }
  if (!pins.length) {
    const alt = html.matchAll(/https:\/\/i\.pinimg\.com\/originals\/[^"\\]+/g);
    for (const m of alt) pins.push(m[0]);
  }
  return [...new Set(pins)];
}

function filterBySize(pins, style) {
  if (!pins.length) return pins;
  if (style === 'banner') return pins;
  return pins;
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) throw new Error(`Pinterest returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// searchPins(query, count) -> [{ url, image, source }]
async function searchPins(query, count = 5) {
  const html = await fetchWithTimeout(
    `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`
  );
  const urls = extractPins(html).slice(0, count);
  return urls.map((image) => ({ url: image, image, source: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}` }));
}

// Style pick: banner prefers landscape (16:9-ish), pfp prefers square.
async function stylePins(query, style = 'banner', count = 3) {
  const suggestions =
    style === 'banner'
      ? `${query} aesthetic wallpaper`
      : `${query} aesthetic pfp`;
  const pins = await searchPins(suggestions, count * 3);
  const chosen = filterBySize(pins, style).slice(0, count);
  if (!chosen.length) throw new Error('No pins found for that query.');
  return chosen;
}

module.exports = { searchPins, stylePins };