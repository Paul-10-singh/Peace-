/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Central custom-emoji registry (shared across modules).
 *
 * Mockup mandate: "Custom emoji IDs come from a central
 *   src/utils/shared/emojis.js registry (reuse VC's stored custom set where
 *   semantics overlap - correct/wrong/time/status - via the shared E object).
 *   No invented IDs, no new uploads."
 *
 * Every ID below is the SAME application-emoji ID the VC module already
 * stores (src/utils/vc/emojis.js). Values are cleaned of stray quotes so
 * they can be embedded in embeds / button emojis without artefacts.
 */

'use strict';

const E = {
  correct: '<a:correct:1550504846199758928>',
  wrong: '<a:wrong:1550504971303395430>',
  time: '<a:time:1550504955691929630>',
  status: '<a:status:1550504949882953820>',
  weeklychart: '<:weeklychart:1550504968119652503>',
  period: '<:period:1550504918756892682>',
  target: '<:target:1550504952349196479>',
  owner: '<a:owner:1550504913815994418>',
  goalcompleted: '<:goalcompleted:1550504884049154159>',
  ACTIVEstatus: '<:ACTIVEstatus:1550504832106766406>',
  INACTIVEstatus: '<:INACTIVEstatus:1550504891758149773>',
};

module.exports = { E };