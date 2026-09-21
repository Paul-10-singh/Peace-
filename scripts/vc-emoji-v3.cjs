/**
 * Peace✘ · Deliverable 1 — VC Module v3.0 "PROFESSIONAL TELEMETRY"
 * Emoji Replacement mode (Step 1–5 of the approved workflow).
 *
 * Reads the ACTUAL custom emoji registry (E object) from src/utils/vcTracker.js
 * — the source of truth, already stored in the bot (no invented IDs, no
 * new uploads). Applies the audited default → stored swaps to mockup.txt
 * (v2), writes mockup.txt (v3) with custom emojis inlined + appends an
 * EMOJI LEGEND section, writes src/utils/vc/emojis.js (the shared registry
 * module Deliverable 1 artifact), then prints:
 *   - STEP 1 · Emoji Audit table
 *   - STEP 2 · Final Mapping table
 * and STOPS for approval before any implementation code (Deliverable 2).
 *
 * Developed by Smith.Code · for approval BEFORE code.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = 'D:\\DISCORD BOT\\AA HOST\\Peace\u2718 \u1D3E\u1D3F\u1D3C hosting';
const TRACKER = path.join(ROOT, 'src', 'utils', 'vcTracker.js');
const MOCK_FILE = path.join(ROOT, 'mockup.txt');
const EMOJI_JS = path.join(ROOT, 'src', 'utils', 'vc', 'emojis.js');
const NEW_DELIM = '\u0003'; // unlikely to appear; used for split/join swaps

// ── STEP 1 · AUDIT — load the STORED registry (source of truth) ──────────
const src = fs.readFileSync(TRACKER, 'utf8');
const block = src.match(/const E = \{([\s\S]*?)\n\};/);
if (!block) throw new Error('Could not locate E registry in vcTracker.js');
const stored = {};
for (const line of block[1].split('\n')) {
  const m = line.match(/^\s*(\w+)\s*:\s*('(<a?:\w+:\d+>)')\s*,?\s*$/);
  if (m) stored[m[1]] = m[2];
}
if (Object.keys(stored).length < 10) {
  throw new Error('Registry incomplete: found ' + Object.keys(stored).length);
}

// The mockup renders these DEFAULT glyphs that HAVE a stored custom
// equivalent in the E registry (semantic role is noted). Everything else
// (🥇🥈🥉 medals, 🟢🟡🔴⚫ presence dots, voice-state 🔊🔇🔈⏸, progress
// ▰▱, arrows/bullets/box-drawing) stays default Unicode — NO stored
// custom exists for those, so per rules we do NOT invent one.
const SWAP = [
  ['\u2705', stored.correct,   'correct / active status badge'],
  ['\u274C', stored.wrong,     'wrong / inactive status badge'],
  ['\u23F1', stored.time,      'time / hero + stats strip'],
  ['\u{1F39B}\uFE0F', stored.status, 'settings panel header'],
  ['\u{1F39B}', stored.status, 'settings panel header (no VS16)'],
  ['\u{1F4CA}', stored.weeklychart, 'weekly chart banner'],
  ['\u{1F4C5}', stored.period, 'period / jump-to-date header'],
  ['\u{1F3AF}', stored.target, 'goal / target hero'],
  ['\u{1F3C6}', stored.goalcompleted, 'goal completed / trophy'],
  ['\u{1F451}', stored.owner,  'guild owner / report DM'],
];

// ── STEP 2 · APPLY — swap mockup v2 → v3 ─────────────────────────────────
let mock = fs.readFileSync(MOCK_FILE, 'utf8');
let swaps = 0;
for (const [d, c] of SWAP) {
  const re = new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const n = (mock.match(re) || []).length;
  if (n > 0) { mock = mock.split(d).join(c); swaps += n; }
}
mock = mock.replace('v2 (REVISED)', 'v3 (EMOJI-READY)');
mock = mock.replace('Revision v2:', 'Revision v3:');

// ── STEP 4 · LEGEND — append the emoji legend + change summary ───────────
const rows = SWAP.map(([d, c, role]) => {
  const key = Object.keys(stored).find((k) => stored[k] === c);
  return `  ${d.padEnd(3)} \u2192  ${c.padEnd(38)} ${role.padEnd(34)} key: ${key}`;
}).join('\n');

mock += `

${'='.repeat(88)}
  EMOJI LEGEND \u00b7 mockup.txt v2 \u2192 v3 (applied in Deliverable 1)
${'='.repeat(88)}
  Source of truth: the E registry ALREADY STORED in the bot
  (src/utils/vcTracker.js) \u2014 11 custom emojis, no invented IDs,
  no new uploads. Every swap below uses the bot's stored glyph IDs.

  STEP 1 \u00b7 EMOJI AUDIT
  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  Default glyphs in mockup.txt v2 that have a stored custom equivalent:
${rows}

  Kept as default Unicode (no stored custom exists \u2014 do NOT invent):
  \ud83e\udd47\ud83e\udd48\ud83e\udd49 medals \u00b7 \ud83d\udfe2\ud83d\udfe1\ud83d\udd34\u26ab presence
  \u00b7 \ud83d\udd0a\ud83d\udd07\ud83d\udd08\u23f8 voice-state \u00b7 \u25b0\u25b1 progress
  \u00b7 formatHours() every time \u00b7 arrows \u2190\u2192\u25c0\u25b6 \u00b7 bullets
  \u00b7 box-drawing \u2550\u2500\u252c\u2534 \u00b7 medals \u2192 goalcompleted only
  when stored glyph exists (it does not \u2014 medals remain Unicode).

  STEP 2 \u00b7 FINAL MAPPING (stored custom \u21d0 default)
  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  | Key              | Value                                      | Replaces  |
  |------------------|--------------------------------------------|-----------|
${Object.keys(stored).map((k) => {
  const r = SWAP.find(([, c]) => c === stored[k]);
  return `  | ${k.padEnd(16)} | ${stored[k].padEnd(42)} | ${r ? r[0] + ' (' + r[2] + ')' : '(reserved)'}`;
}).join('\n')}

  Render note: custom emojis only render if the bot can USE external
  emojis in that channel; they show the raw text otherwise (mockup keeps
  the exact <:name:id> form so review sees the real syntax).
`.trimStart();

fs.writeFileSync(MOCK_FILE, mock, 'utf8');

// ── STEP 3 · Deliverable 1 artifact — src/utils/vc/emojis.js ─────────────
fs.mkdirSync(path.dirname(EMOJI_JS), { recursive: true });
const lines = Object.keys(stored).map((k) => `  ${k}: '${stored[k]}',`);
const js = `/*
 * Peace\u2718 \u2014 Discord Bot \u00b7 Developed by Smith.Code
 * Shared VC-module emoji registry (Deliverable 1 artifact).
 * Mirrors the E registry ALREADY STORED in src/utils/vcTracker.js \u2014 the
 * single source of truth. Commands import this module instead of
 * re-declaring emojis, so every embed renders the identical custom set.
 */
const E = {
${lines.join('\n')}
};

module.exports = { E };
`;
fs.writeFileSync(EMOJI_JS, js, 'utf8');

// ── Output for the reviewer, then STOP ───────────────────────────────────
console.log('STEP 1 \u00b7 EMOJI AUDIT \u2014 default glyphs in mockup.txt v2 that have a');
console.log('stored custom equivalent (source: vcTracker.js E registry):');
for (const [g, c, role] of SWAP) {
  const key = Object.keys(stored).find((k) => stored[k] === c);
  console.log(`   ${g}  \u2192  ${c}   (${role})  key: ${key}`);
}
console.log('\nSTEP 2 \u00b7 FINAL MAPPING \u2014 stored custom \u21d0 default, per registry:');
console.log('  Key              Value                                      Replaces');
for (const k of Object.keys(stored)) {
  const r = SWAP.find(([, c]) => c === stored[k]);
  console.log(`  ${k.padEnd(16)} ${stored[k].padEnd(42)} ${r ? r[0] + ' (' + r[2] + ')' : '(reserved)'}`);
}
console.log('\nWROTE: ' + MOCK_FILE + ' (v3, ' + swaps + ' glyph swaps + LEGEND)');
console.log('WROTE: ' + EMOJI_JS + ' (' + Object.keys(stored).length + ' stored customs mirrored)');

console.log('\n\u2500\u2500\u2500 STOP \u2014 awaiting approval before Deliverable 2 \u2500\u2500\u2500');
console.log('Deliverable 1 (this): mockup.txt v3 + emojis.js registry \u2014 DONE.');
console.log('Deliverable 2 (next, ONLY on APPROVE): Sunday report DM (4 sched embeds),');
console.log('vc_reminders + vc_reminder_sweep, report DM toggle, dynamic CSV labels,');
console.log('formatHours() refactor, vchart clamps \u2014 schema.sql + db.js + store.js.');
console.log('\nReply APPROVE to continue, or REVISE <what> to iterate (STILL before code).');
_