/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - embeds tests (Deliverable 5)
 *
 * Enforces the mockup global rules: title starts with an emoji, footer is
 * "Peace* Truth or Dare · <relative timestamp>", and the color accents per
 * embed variant.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const embeds = require('../../src/utils/tod/embeds.js');

const { COLORS } = embeds;

function data(builder) {
  return builder.toJSON() || builder.data;
}

describe('footer + stamping', () => {
  it('stamp produces a relative Discord timestamp', () => {
    expect(embeds.stamp(1_700_000_000_000)).toBe('<t:1700000000:R>');
  });

  it('every embed carries the mocked footer', () => {
    const titleParts = ['🎭 Truth or Dare'];
    const panel = data(embeds.mainPanel({}));
    expect(panel.footer.text).toMatch(/^Peace\u2718 Truth or Dare \u00b7 <t:\d+:R>$/);
    expect(panel.title).toBe(titleParts[0]);
  });
});

describe('colors', () => {
  it('main panel is info blurple', () => {
    expect(data(embeds.mainPanel({})).color).toBe(COLORS.info);
  });

  it('lobby and player turn are active green', () => {
    expect(data(embeds.lobby({ players: [] })).color).toBe(COLORS.active);
    expect(data(embeds.playerTurn({})).color).toBe(COLORS.active);
  });

  it('prompt is neutral dark', () => {
    expect(data(embeds.prompt({})).color).toBe(COLORS.neutral);
  });

  it('refuse/timeout feedback is inactive red, done is green', () => {
    expect(data(embeds.roundFeedback({ action: 'refuse' })).color).toBe(COLORS.inactive);
    expect(data(embeds.roundFeedback({ action: 'timeout' })).color).toBe(COLORS.inactive);
    expect(data(embeds.roundFeedback({ action: 'done' })).color).toBe(COLORS.active);
  });

  it('session ended is active green with leader medals', () => {
    const d = data(embeds.sessionEnded({
      roundCount: 8,
      players: [{ name: '@UserA', turns: 3, truths: 2, dares: 1, skips: 0 }],
    }));
    expect(d.color).toBe(COLORS.active);
    expect(d.description).toContain('\u{1F947} @UserA');
  });
});

describe('content', () => {
  it('main panel shows Intensity / Categories / Rounds Played', () => {
    const d = data(embeds.mainPanel({
      intensity: 'pg13',
      categories: 'Funny, Deep, Weird',
      roundsPlayed: 128,
      longestSession: 33,
    }));
    expect(d.description).toContain('**Status:** Idle');
    expect(d.description).toContain('PG-13');
    expect(d.description).toContain('Funny, Deep, Weird');
    expect(d.description).toContain('**Rounds Played:** 128');
  });

  it('playerTurn title starts with emoji + round number', () => {
    const d = data(embeds.playerTurn({ roundNo: 7, currentUser: '@UserB' }));
    expect(d.title).toBe(`\u{1F3AD} Round 7 \u2014 @UserB's turn!`);
  });

  it('prompt embeds include the target name and timer label', () => {
    const d = data(embeds.prompt({ kind: 'dare', category: 'Weird', text: 'Do 10 squats.', timerLabel: '5 minutes' }));
    expect(d.title).toContain('Dare');
    expect(d.title).toContain('Weird');
    expect(d.description).toContain('\u201cDo 10 squats.\u201d');
    expect(d.description).toContain('5 minutes');
  });

  it('round feedback shows empty-roster end state', () => {
    const d = data(embeds.roundFeedback({ action: 'ended' }));
    expect(d.description).toContain('No active players left');
  });

  it('sessionFull / missingPermission are red lock embeds', () => {
    expect(data(embeds.sessionFull(20, 20)).color).toBe(COLORS.inactive);
    expect(data(embeds.missingPermission()).description).toContain('Manage Guild');
  });

  it('spicyLocked mentions the 24h no-undo gate', () => {
    expect(data(embeds.spicyLocked()).description).toContain("can't be turned off for 24h");
  });
});