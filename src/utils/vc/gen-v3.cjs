// Peace✘ · Deliverable 1 (Emoji Replacement) — generator
// Reads the STORED custom-emoji registry from src/utils/vcTracker.js (the
// source of truth — no invented IDs), applies the documented mapping to
// mockup.txt v2 → writes mockup_v3.txt + src/utils/vc/emojis.js, then
// prints the Emoji Audit + Final Mapping tables and STOPS.

const fs = require('fs');
const path = require('path');

const ROOT = 'D:\\DISCORD BOT\\AA HOST\\Peace✘ ᴾᴿᴼ hosting';
const TRACKER = path.join(ROOT, 'src', 'utils', 'vcTracker.js');
const MOCK = path.join(ROOT, 'mockup.txt');
const DST_MOCK = path.join(ROOT, 'mockup_v3.txt');
const DST_JS = path.join(ROOT, 'src', 'utils', 'vc', 'emojis.js');

// ── 1. Load the stored E registry verbatim from the tracker ─────────────
const src = fs.readFileSync(TRACKER, 'utf8');
const block = src.match(/const E = \{([\s\S]*?)\n\};/);
if (!block) throw new Error('E registry block not found in vcTracker.js');
const stored = {};
for (const line of block[1].split('\n')) {
  const m = line.match(/^\s*([A-Za-z_]\w*)\s*:\s*'((?:<a?:\w+:\d+>))'\s*,?$/);
  if (m) stored[m[1]] = m[2];
}
if (Object.keys(stored).length < 11) {
  throw new Error('Expected >=11 stored custom emojis, found ' + Object.keys(stored).length);
}

// ── 2. DOCUMENTED mapping: default mockup glyph → stored custom key ──────
// Each choice is shown in the Final Mapping Table for approval. Glyphs with
// NO stored custom equivalent stay default Unicode (medals, presence dots,
// voice-state icons, chart bars ▰▱, arrows, bullets — per GLOBAL RULES).
const map = [
  ['\u2705', stored.correct],          // ✅ active/goal-met badge
  ['\u274C', stored.wrong],            // ❌ inactive/not-met badge
  ['\u23F1', stored.time],             // ⏱ time/hero icon
  ['\u23F3', stored.time],             // ⏳ hourglass → time
  ['\u{1F39B}\uFE0F', stored.status],  // 🎛️ settings panel header
  ['\u{1F39B}', stored.status],        // 🎛 (no VS16)
  ['\u{1F4CA}', stored.weeklychart],   // 📊 weekly chart banner + /vchart
  ['\u{1F4C8}', stored.weeklychart],   // 📈 history/leaderboard trend → weeklychart
  ['\u{1F4C5}', stored.period],        // 📅 period header + jump-to-date
  ['\u{1F5D3}\uFE0F', stored.period],  // 🗓️ period context
  ['\u{1F3AF}', stored.target],        // 🎯 goal/task target
  ['\u{1F3C6}', stored.goalcompleted], // 🏆 leader #1 / goal completed
  ['\u{1F3C5}', stored.goalcompleted], // 🏅 biggest-session / top-3 hero
  ['\u{1F451}', stored.owner],         // 👑 guild owner (report DM / panel)
  ['\u{1F451}', stored.owner],         // (dedupe safe)
  ['\u{1F7E2}', stored.ACTIVEstatus],  // 🟢 ACTIVE status dot
  ['\u{1F534}', stored.INACTIVEstatus],// 🔴 INACTIVE status dot
].filter((e, i, a) => a.findIndex((x) => x[0] === e[0]) === i);

// ── 3. Apply swaps (only glyphs present in the mockup get swapped) ───────
let mock = fs.readFileSync(MOCK, 'utf8');
let swaps = 0;
for (const [from, to] of map) {
  const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const n = (mock.match(re) || []).length;
  if (n > 0) { mock = mock.replace(re, to); swaps += n; }
}

// ── 4. Append the v3 legend block ────────────────────────────────────────
const legend = `

EMOJI LEGEND · mockup.txt v2 → v3 (custom swaps only)
────────────────────────────────────────────────────
The 11 custom emojis below were ALREADY STORED in the bot
(src/utils/vcTracker.js \u00b7 E registry) and are now inlined in this
mockup. NO new emoji was uploaded; NO ID was invented.

  DEFAULT   →   STORED CUSTOM                     USED AS
  ──────────┼─────────────────────────────────────┼──────────────────────
` + map.map(([d, c]) => {
  const key = Object.keys(stored).find((k) => stored[k] === c);
  return '  ' + d + '  →  ' + c.padEnd(38) + '  ' + key;
}).join('\n') + `

  KEPT AS DEFAULT (no stored custom equivalent — unchanged):
  🥇🥈🥉 medals · 🟢🟡🔴⚫ presence dots (online/idle/dnd/offline)
  · 🔊🔇🔈🔇⏸ voice-state icons · ▰▱ progress/chart fills
  · 🚪🌙🎭 empty states · 🔔 notify · 📄📤 CSV/export · 📊 jump
  · arrows ◀ ▶ → · bullets · box-drawing ═ ─ ┌ ┐ └ ┘ │ ───

  NEXT STEP (STOP point): Deliverable 1 = THIS mockup v3 + the emoji
  registry. Approve BEFORE any Deliverable 2 code (schema/db/store) is
  written. Reply "APPROVE" to continue or "REVISE <what>" to adjust.
`;

fs.writeFileSync(DST_MOCK, mock + legend, 'utf8');

// ── 5. Write the emoji registry module (Deliverable 1 artifact) ──────────
const jsBody = `/*
 * Peace✘ — Discord Bot · Developed by Smith.Code
 *
 * Shared emoji registry for the VC Module v3.0 · "Professional Telemetry".
 * These are the custom emojis ALREADY STORED on the bot's host server
 * (uploaded via the Developer Portal) — mirrored 1:1 from the E registry
 * in src/utils/vcTracker.js. This module is the SINGLE import point so
 * every command/file renders the identical custom set. Anything without
 * a stored custom equivalent stays a default Unicode glyph (kept inline,
 * per mockup.txt v3 Global Rules).
 *
 * No runtime lookup; pure constant map. Usage:
 *   const { E } = require('../vc/emojis');
 */

const E = {
${Object.entries(stored).map(([k, v]) => `  ${k}: '${v}',`).join('\n')}
};

module.exports = { E };
`;
const jsDir = path.dirname(DST_JS);
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
fs.writeFileSync(DST_JS, jsBody, 'utf8');

// ── 6. Print the tables (Deliverable 1 output) then STOP ─────────────────
console.log('STEP 1 · EMOJI AUDIT — default glyphs still present in mockup v2');
console.log('────────────────────────────────────────────────────────────────');
const auditRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/gu;
const seen = new Set((fs.readFileSync(MOCK, 'utf8').match(auditRe) || []));
console.log([...seen].sort().join(' '));
console.log('(' + seen.size + ' distinct emoji code points scanned)');

console.log('\nSTEP 2 · FINAL MAPPING (applied in mockup_v3.txt)');
console.log('Default  →  Stored custom key + value');
for (const [d, c] of map) {
  const key = Object.keys(stored).find((k) => stored[k] === c);
  console.log(`  ${d}  →  ${key}  ${c}`);
}
console.log('\nEmoji registry written: ' + DST_JS);
console.log('mockup_v3.txt written (%d bytes) · %d glyph swaps', fs.statSync(DST_MOCK).size, swaps);
console.log('\n═══ STOP — awaiting approval before Deliverable 2 ═══');
