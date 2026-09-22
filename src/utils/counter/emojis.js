'use strict';
/*
 * Peace* -- Discord Bot -- Developed by Smith.Code
 *
 * Counter -- emojis.js (Deliverable 4 / reaction emoji map)
 *
 * Byte-locked rule: NO INVENTED custom IDs. This module re-exports
 * ONLY the shared Peace* emoji registry (src/utils/shared/emojis.js)
 * under counter-friendly names, so embeds/panel/game all reference
 * the SAME customs the rest of the bot uses. If a name is absent
 * from the shared registry it stays undefined here -- never invented.
 */

const shared = require('../shared/emojis');

const E = {
  correct:  shared.correct,   // green check -- correct count
  wrong:    shared.wrong,     // red cross -- ruin
  check:    shared.check,     // ballot check -- audit/success
  milestone: shared.milestone, // gold star -- milestone
};

// Number digit reactions (0-9) -- only when present in the shared
// registry; undefined otherwise (callers must guard).
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
for (const name of DIGITS) {
  if (shared[name]) E[name] = shared[name];
}

function numberEmojiName(number) {
  if (!Number.isSafeInteger(number)) return null;
  const abs = Math.abs(number);
  if (abs > 9) return null;
  return DIGITS[abs];
}

module.exports = { E };
