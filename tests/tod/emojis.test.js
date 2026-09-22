/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - emojis tests (Deliverable 5)
 *
 * Custom emoji IDs must come from the central shared registry - identical
 * to the stored VC set, never invented. Unicode defaults stay spelled out.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { E: SHARED } = require('../../src/utils/shared/emojis.js');
const { E, GLYPH } = require('../../src/utils/tod/emojis.js');

// Exact IDs stored by the VC module (src/utils/vc/emojis.js) - no invented IDs.
const VC_SET = {
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

describe('shared registry', () => {
  it('matches the VC stored custom set exactly', () => {
    expect(SHARED).toEqual(VC_SET);
  });
});

describe('tod emojis', () => {
  it('reuses shared customs for overlapping semantics', () => {
    expect(E.correct).toBe(VC_SET.correct);
    expect(E.wrong).toBe(VC_SET.wrong);
    expect(E.time).toBe(VC_SET.time);
    expect(E.status).toBe(VC_SET.status);
  });

  it('ships the core brand + action glyphs', () => {
    expect(GLYPH.panel).toBe('\u{1F3AD}');
    expect(GLYPH.spicy).toBe('\u{1F51E}');
    expect(GLYPH.join).toBe('\u2705');
    expect(GLYPH.skip).toBe('\u23ED\u{FE0F}');
    expect(GLYPH.refuse).toBe('\u274C');
    expect(GLYPH.medal).toEqual(['\u{1F947}', '\u{1F948}', '\u{1F949}']);
  });

  it('never has a bare custom id string present in glyphs', () => {
    for (const v of Object.values(GLYPH)) {
      if (typeof v === 'string') expect(v).not.toMatch(/^<a?:/);
    }
  });
});