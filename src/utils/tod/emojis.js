/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - emojis.js (Deliverable 5)
 *
 * The ONLY place the ToD module may get emojis from. Custom emoji IDs come
 * from the central shared registry (src/utils/shared/emojis.js) - reusing
 * the VC custom set where the semantics overlap (correct = Truth, wrong =
 * Dare, time = timers). Everything else is a spelled-out Unicode default so
 * review sees the exact glyph. Commands never hardcode an emoji inline.
 *
 * Exports:
 *   E      - full ToD emoji lookup (custom + glyphs merged)
 *   GLYPH  - the Unicode glyph map alone (used by tests / tooling)
 */

'use strict';

const { E: SHARED } = require('../shared/emojis');

// Pure-Unicode defaults (spelled out on purpose).
const GLYPH = {
  panel: '\u{1F3AD}',      // 🎭 Truth or Dare brand
  settings: '\u{2699}\u{FE0F}', // ⚙️
  prompts: '\u{1F4DD}',    // 📝
  stats: '\u{1F4CA}',      // 📊
  history: '\u{1F5DC}\u{FE0F}', // 📜
  join: '\u2705',          // ✅
  start: '\u25B6\u{FE0F}', // ▶️
  leave: '\u{1F6AA}',      // 🚪
  skip: '\u23ED\u{FE0F}',  // ⏭️
  done: '\u2705',          // ✅
  refuse: '\u274C',        // ❌
  playAgain: '\u{1F504}',  // 🔄
  end: '\u23F9\u{FE0F}',   // ⏹️
  spectate: '\u{1F4A5}',   // 💥
  lock: '\u{1F512}',       // 🔒
  trash: '\u{1F5D1}\u{FE0F}', // 🗑️
  add: '\u2795',           // ➕
  reload: '\u{1F504}',     // 🔄
  export: '\u{1F4C4}',     // 📄
  prev: '\u25C0\u{FE0F}',  // ◀️
  next: '\u25B6\u{FE0F}',  // ▶️
  warn: '\u26A0\u{FE0F}',  // ⚠️
  info: '\u2139\u{FE0F}',  // ℹ️
  spicy: '\u{1F51E}',      // 🔞
  cancel: '\u21A9\u{FE0F}', // ↩️
  timer: '\u23F1\u{FE0F}', // ⏱️
  medal: ['\u{1F947}', '\u{1F948}', '\u{1F949}'], // 🥇 🥈 🥉
  striker: '\u{1F4A2}',    // 💢
};

// ToD lookup table: shared customs first, glyphs override nothing (lexically
// distinct keys) so both are reachable.
const E = { ...SHARED, ...GLYPH };

module.exports = { E, GLYPH };