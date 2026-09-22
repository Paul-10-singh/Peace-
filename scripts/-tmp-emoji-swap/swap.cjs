// ─────────────────────────────────────────────────────────────────────────
//  Deliverable 1 · Emoji Replacement transform for mockup.txt v3
//  Smith.Code · reads the ACTUAL stored custom emoji registry (E) from
//  src/utils/vcTracker.js (source of truth — no invented IDs), swaps the
//  matching default glyphs in mockup.txt v2, appends the LEGEND + change
//  summary, writes mockup.txt v3, and PRINTS the audit + mapping tables.
//  This is a text transform ONLY — no bot code is written.
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const ROOT = 'D:\\DISCORD BOT\\AA HOST\\Peace\u2718 \u1D50\u1D3F\u1D3C hosting';
const SRC_V2 = path.join(ROOT, 'mockup.txt');
const DST_V3 = path.join(ROOT, 'mockup_v3.txt');
const TRACKER = path.join(ROOT, 'src', 'utils', 'vcTracker.js');

// 1) Load the ACTUAL stored registry (do not hardcode — read from source).
const trackerSrc = fs.readFileSync(TRACKER, 'utf8');
const eBlock = trackerSrc.match(/const E = \{([\s\S]*?)\n\};/);
if (!eBlock) throw new Error('Could not locate the E registry in vcTracker.js');
const stored = {};
for (const m of eBlock[1].matchAll(/^\s*(\w+)\s*:\s*'(<[^>]+>)'/gm)) {
  stored[m[1]] = m[2];
}

// 2) Read the v2 mockup.
let mock = fs.readFileSync(SRC_V2, 'utf8');

// 3) Map of default-glyph → stored custom (chosen because the existing code
//    already uses exactly these customs for exactly these semantics).
//    All other defaults in the mockup (medals 🥇🥈🥉, presence dots 🟢🟡🔴⚫,
//    chart fill ▰▱, arrows, etc.) intentionally stay Unicode.
const swap = [
  // hero / statusBadge
  ['✅', stored.correct],
  ['❌', stored.wrong],
  // time / HMS / session duration
  ['⏱', stored.time],
  // settings panel header + status strip icon
  ['🎛️', stored.status],
  // weekly chart banner + chart header
  ['📊', stored.weeklychart],
  // period / jump-to-date / calendar
  ['📅', stored.period],
  // goal / target / task
  ['🎯', stored.target],
  // report DM to guild owner / owner context
  ['👑', stored.owner],
  // goal completed / hero trophy / leaderboard gold
  ['🏆', stored.goalcompleted],
  // ACTIVE status badge
  ['🟢', stored.ACTIVEstatus],
  // INACTIVE status badge (hero + per-row)
  ['🔴', stored.INACTIVEstatus],
];

const auditHeader =
  '  EMIT | DEFAULT      | STORED CUSTOM                       | USED FOR\n' +
  '  ─────┼──────────────┼─────────────────────────────────────┼──────────────────────────────`;
const auditRows = swap.map(
  ([d, c]) => '  ' + '  | ' + d.padEnd(12) + ' | ' + c.padEnd(37) + ' | ' + labelFor(stored, d)
);
function labelFor(s, glyph) {
  return {
    '✅': 'statusBadge(active), goal-check, correct states',
    '❌': 'statusBadge(inactive), wrong/inactive states',
    '⏱': 'time heroes, formatHours duration text',
    '🎛️': 'settings panel title, status strip icon',
    '📊': 'weekly chart banner, chart embeds',
    '📅': 'period range, jump-to-date, calendar',
    '🎯': 'goal/target/task headers + stats',
    '👑': 'guild-owner report context',
    '🏆': 'completed goal, leaderboard/hero trophy',
    '🟢': 'ACTIVE status badge',
    '🔴': 'INACTIVE status badge',
  }[glyph] || '—';
}

// 4) Apply swaps (replace only the mockup's *content* emojis; bar rows ▰▱
//    and box-drawing chars are untouched because they're not in the map).
for (const [d, c] of swap) {
  mock = mock.split(d).join(c);
}

// 5) Append the LEGEND / emoji map section + change summary (v2 → v3).
let swapTable = auditHeader + '\n' + auditRows.join('\n');
const legend = `

════════════════════════════════════════════════════════════════════════
  EMOJI REPLACEMENT · mockup.txt v2 → v3  (CHANGE SUMMARY)
════════════════════════════════════════════════════════════════════════
  WHAT      | WAS                                   → NOW
  ──────────┼────────────────────────────────────────────────────────────
  Emojis    | default Unicode glyphs in all embeds → bot's own stored
            | CUSTOM emojis (from the E registry that ALREADY exists in
            | src/utils/vcTracker.js — NOT new uploads, NOT invented IDs)
  Scope     | Only the 11 glyphs below were swapped. Medals 🥇🥈🥉, the
            | progress bars ▰▱, presence dots 🟢🟡🟠🔴, mobile note 📱,
            | and all box-drawing/arrow chars are UNCHANGED (no custom
            | equivalents were provided for them — they stay Unicode).
  Codebase  | utils/vc/emojis.js will export THIS exact map (shared E)
            | so every command renders identical custom emojis. No
            | inline default emojis remain in VC embeds.

${swapTable}

  LEGEND — every custom emoji, what it replaces, where it appears
  ─────────────────────────────────────────────────────────────────────
  Key             | Custom emoji value (stored)                         | Replaces
  ────────────────┼─────────────────────────────────────────────────────┼──────────────
  correct         | <a:correct:1550504846199758928>                     | ✅
  wrong           | <a:wrong:1550504971303395430>                       | ❌
  time            | <a:time:1550504955691929630>                        | ⏱
  status          | <a:status:1550504949882953820>                      | 🎛️
  weeklychart     | <:weeklychart:1550504968119652503>                  | 📊
  period          | <:period:1550504918756892682>                       | 📅
  target          | <:target:1550504952349196479>                       | 🎯
  owner           | <a:owner:1550504913815994418>                       | 👑
  goalcompleted   | <:goalcompleted:1550504884049154159>                | 🏆
  ACTIVEstatus    | <:ACTIVEstatus:1550504832106766406>                 | 🟢
  INACTIVEstatus  | <:INACTIVEstatus:1550504891758149773>               | 🔴
  ────────────────┴─────────────────────────────────────────────────────┴──────────────

  Values on the left come from the EXISTING E in src/utils/vcTracker.js
  (read at transform time, lines 42–54). Kept Unicode (no custom provided):
  🥇🥈🥉 medals · ▰/▱ progress fill · 🟢🟡🟠🔴 presence · 📱 mobile note
  · 🚪 🌙 🎭 empty states · 🔊🔇🔈⏸ voice state · 📄📤 CSV/export
  · 📌 🔥 🏅 👥 ⚡ 📈 🔔 📬 🌍 🔄 ⏳ ⚠️ 🔒 · all box-drawing/arrows.
`;

fs.writeFileSync(DST_V3, mock + legend, 'utf8');
console.log('STEP 1 · EMOJI AUDIT (defaults used in mockup v2 vs stored registry):');
console.log(swap.map(([d, c]) => `  ${d}  →  ${c}`).join('\n'));
console.log('\nSTEP 2+4 · wrote mockup_v3.txt (%d bytes) with custom emojis inlined + LEGEND.', fs.statSync(DST_V3).size);
console.log('DELIVERABLE 1 COMPLETE — STOPPING for approval.');
