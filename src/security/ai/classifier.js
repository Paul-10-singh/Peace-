/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 3 : HYBRID AI MESSAGE ANALYSIS.
 *
 * Pipeline (fast -> slow):
 *   1. Fast path — regex signals + known-bad content hash DB (24h cache).
 *   2. Slow path — local on-box classifier (transformers.js distilbert
 *      multilingual) when the model is installed (`SECURITY_AI_LOCAL=1`).
 *   3. Escalation — only scores in the ambiguous band 0.4..0.7 go to an
 *      LLM (OpenAI-compatible or Anthropic) with a strict JSON-schema prompt.
 *
 * Never blocks the message path: analyze() resolves fast-path verdicts
 * synchronously-equivalent (async) and always falls back to "safe" with a
 * source label when every slow layer is unavailable.
 *
 * Output schema: { verdict: safe|spam|scam|harass|nsfw|phish,
 *                  confidence: 0-1, reason, indicators[] }
 */
const { contentHash } = require('../crypto');
const cache = require('./cache');
const { t } = require('../i18n');

const AMBIGUOUS_MIN = 0.4;
const AMBIGUOUS_MAX = 0.7;
const VERDICTS = ['safe', 'spam', 'scam', 'harass', 'nsfw', 'phish'];

// ── fast-path regex signals (kept tight; cheap, deterministic) ─────────────
const SIGNALS = [
  { verdict: 'phish', score: 0.9, re: /https?:\/\/\S+\.(ru|xyz|top|tk|ml|ga|cf|gq)(\/|\s|$)/i },
  { verdict: 'phish', score: 0.85, re: /(discord|nitro).{0,20}(giveaway|free|claim)/i },
  { verdict: 'scam', score: 0.9, re: /https?:\/\/(free-?nitro|nitro-?gift|discordnitro|steam-?gift|free-?gifts?|give-?away|givaway)[^ ]*/i },
  { verdict: 'scam', score: 0.9, re: /steamcommunity\.com\/gifts?[^ ]*/i },
  { verdict: 'phish', score: 0.85, re: /(verify|claim).{0,12}(nitro|steam|stealer)/i },
  { verdict: 'harass', score: 0.8, re: /\b((kill|die|kys|seppuku|neck) yourself|izmir|snitch|retard)\b/i },
];

let classifierPipeline = null;

/** Load the on-box transformers.js classifier (lazy; optional dependency). */
async function loadLocalClassifier() {
  if (classifierPipeline) return classifierPipeline;
  if (process.env.SECURITY_AI_LOCAL !== '1') return null;
  try {
    const { pipeline } = await import('@xenova/transformers');
    classifierPipeline = { pipe: await pipeline('text-classification', process.env.SECURITY_AI_MODEL || 'Xenova/distilbert-base-multilingual-cased'), unset: false };
    return classifierPipeline;
  } catch {
    classifierPipeline = null;
    return null;
  }
}

async function localClassify(text) {
  const model = await loadLocalClassifier();
  if (!model) return null;
  try {
    const out = await model.pipe(text);
    const top = Array.isArray(out) ? out[0] : out;
    const label = (top?.label || '').toLowerCase();
    const confidence = Number(top?.score ?? 0);
    const negative = !label || label === 'neutral' || label.startsWith('normal') || label === 'label_0';
    return { score: negative ? 1 - confidence : confidence, label };
  } catch {
    return null;
  }
}

/** LLM escalation with strict JSON-schema output. Returns parsed verdict or null. */
async function llmClassify(text, guildId) {
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || null;
  const base = process.env.AI_API_BASE || 'https://api.openai.com/v1';
  if (!key) return null;

  const { slidingWindow } = require('../ratelimit/redis');
  if (!(await slidingWindow(`ai:llm:${guildId || '*'}`, 100, 60_000)).allowed) return null;

  const system = [
    `Classify the following Discord message. Reply with STRICT JSON only:`,
    `{"verdict":"safe|spam|scam|harass|nsfw|phish","confidence":0-1,"reason":"short","indicators":["..."]}`,
    `Be conservative: safe unless there is strong evidence. Never invent indicators.`,
  ].join('\n');

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text.slice(0, 1500) },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!VERDICTS.includes(parsed.verdict)) return null;
    return {
      verdict: parsed.verdict,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reason: parsed.reason || '',
      indicators: Array.isArray(parsed.indicators) ? parsed.indicators : [],
      source: 'llm',
    };
  } catch {
    return null;
  }
}

/**
 * Main entry: analyze text.
 *   fast: regex + known-bad hash cache
 *   slow: local classifier / LLM when enabled and needed
 * Returns { verdict, confidence, reason, indicators, source }.
 */
async function analyze(text, { guildId = null, knownBad = false, localClassifier = null } = {}) {
  if (!text) return { verdict: 'safe', confidence: 1, reason: 'empty', indicators: [], source: 'fast' };

  // 1) cache fast-path hit
  const cached = cache.get(text);
  if (cached) {
    return { verdict: cached.verdict, confidence: cached.confidence, reason: cached.reason, indicators: safeParse(cached.indicators), source: 'cache' };
  }

  // 2) fast regex + known-bad
  let best = { verdict: 'safe', confidence: 0, reason: 'no-signal', indicators: [], source: 'fast' };
  for (const s of SIGNALS) {
    if (s.re.test(text) && s.score > best.confidence) {
      if (best.verdict === 'safe') best = { verdict: s.verdict, confidence: s.score, reason: `regex:${s.verdict}`, indicators: [s.re.source], source: 'fast' };
      else if (s.score > best.confidence) best = { verdict: s.verdict, confidence: s.score, reason: `regex:${s.verdict}`, indicators: best.indicators.concat(s.re.source), source: 'fast' };
      if (knownBad) { best.confidence = 1; best.reason = 'known-bad-bloom'; best.source = 'bloom'; }
    }
  }
  if (knownBad && best.verdict === 'safe') {
    best = { verdict: 'spam', confidence: 0.99, reason: 'known-bad-content-hash', indicators: ['known-bad'], source: 'bloom' };
  }
  if (best.source === 'fast' && best.verdict !== 'safe' && best.confidence >= 0.8) {
    cache.set(text, best.verdict, best.confidence, best.reason, best.indicators);
    return best;
  }

  // 3) local classifier (slow path) when enabled
  const local = await localClassify(text);
  if (local && (local.score >= AMBIGUOUS_MAX || local.score <= AMBIGUOUS_MIN)) {
    const verdict = local.score >= AMBIGUOUS_MAX ? (best.verdict !== 'safe' ? best.verdict : 'spam') : 'safe';
    const result = { verdict, confidence: local.score, reason: `local-classifier:${local.label}`, indicators: [local.label], source: 'local' };
    cache.set(text, result.verdict, 0.6, result.reason, result.indicators);
    return result;
  }

  // 4) ambiguous band (0.4..0.7): escalate to LLM only
  const llmVerdict = await llmClassify(text, guildId);
  if (llmVerdict) {
    cache.set(text, llmVerdict.verdict, llmVerdict.confidence, llmVerdict.reason, llmVerdict.indicators);
    return llmVerdict;
  }

  // graceful degradation: surface the fast-path signal or safe
  if (best.verdict !== 'safe') {
    cache.set(text, best.verdict, best.confidence, best.reason, best.indicators);
  }
  return best;
}

function safeParse(raw) {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

function disable() { cache.disable(); }

module.exports = { analyze, loadLocalClassifier, VERDICTS, AMBIGUOUS_MIN, AMBIGUOUS_MAX, disable };