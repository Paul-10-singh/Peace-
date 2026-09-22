/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare module - prompts.test.js (Deliverable 3)
 *
 * Pack integrity + no-repeat + spicy gate coverage for prompts.js.
 */

'use strict';

import { describe, it, expect } from 'vitest';

import p from '../../src/utils/tod/prompts.js';

const NOW = Date.now();
const UNLOCKED = NOW - 26 * 60 * 60 * 1000; // 26h ago: 24h lock expired
const LOCKED = NOW - 60 * 60 * 1000; // 1h ago: lock still active

describe('pack integrity', () => {
  it('loads every pack without error', () => {
    const packs = p.loadAllPacks();
    expect(Object.keys(packs).sort()).toEqual(['deep', 'funny', 'party', 'spicy', 'weird']);
  });

  it('every pack has at least 15 prompts with a truth and dare mix', () => {
    const summary = p.getPackSummary();
    for (const category of Object.keys(summary)) {
      const counts = summary[category];
      expect(counts.total).toBeGreaterThanOrEqual(15);
      expect(counts.truth).toBeGreaterThan(0);
      expect(counts.dare).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids across all packs combined', () => {
    const ids = [];
    for (const pack of Object.values(p.loadAllPacks())) {
      for (const prompt of pack.prompts) ids.push(prompt.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every prompt text is at most 200 chars', () => {
    for (const pack of Object.values(p.loadAllPacks())) {
      for (const prompt of pack.prompts) {
        expect(prompt.text.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('every prompt has a valid kind and intensity', () => {
    const kinds = new Set(['truth', 'dare']);
    const intensities = new Set(['pg', 'pg13', 'r']);
    for (const pack of Object.values(p.loadAllPacks())) {
      for (const prompt of pack.prompts) {
        expect(kinds.has(prompt.kind)).toBe(true);
        expect(intensities.has(prompt.intensity)).toBe(true);
      }
    }
  });

  it('every prompt text is ASCII-only', () => {
    for (const pack of Object.values(p.loadAllPacks())) {
      for (const prompt of pack.prompts) {
        expect(/^[\x00-\x7F]*$/.test(prompt.text)).toBe(true);
      }
    }
  });

  it('every prompt id has the expected category prefix', () => {
    for (const [category, pack] of Object.entries(p.loadAllPacks())) {
      for (const prompt of pack.prompts) {
        expect(prompt.id.startsWith(`${category}-`)).toBe(true);
      }
    }
  });
});

describe('getRandomPrompt - R8 no-repeat', () => {
  it('never returns a prompt from excludeIds', () => {
    for (let i = 0; i < 200; i += 1) {
      const prompt = p.getRandomPrompt({
        category: 'funny',
        intensity: 'r',
        excludeIds: ['funny-001', 'funny-002'],
      });
      expect(prompt).not.toBeNull();
      expect(['funny-001', 'funny-002']).not.toContain(prompt.id);
    }
  });

  it('returns null when excludeIds covers the entire pool', () => {
    const pack = p.loadAllPacks().funny;
    const allIds = pack.prompts.map((x) => x.id);
    expect(p.getRandomPrompt({ category: 'funny', intensity: 'pg', excludeIds: allIds })).toBeNull();
  });

  it('filters by kind', () => {
    const prompt = p.getRandomPrompt({ category: 'deep', intensity: 'r', kind: 'dare' });
    expect(prompt.kind).toBe('dare');
  });
});

describe('spicy gate', () => {
  it('spicy is NOT loaded when intensity is not r', () => {
    expect(p.getRandomPrompt({ category: 'spicy', intensity: 'pg13', spicyEnabledAt: UNLOCKED })).toBeNull();
    expect(p.getRandomPrompt({ category: 'spicy', intensity: 'pg', spicyEnabledAt: UNLOCKED })).toBeNull();
  });

  it('spicy is NOT loaded when spicyEnabledAt is unset', () => {
    expect(p.getRandomPrompt({ category: 'spicy', intensity: 'r' })).toBeNull();
  });

  it('spicy is NOT loaded while the 24h lock is still active', () => {
    expect(p.getRandomPrompt({ category: 'spicy', intensity: 'r', spicyEnabledAt: LOCKED })).toBeNull();
  });

  it('spicy IS loaded when intensity r + enabled + lock expired', () => {
    const prompt = p.getRandomPrompt({ category: 'spicy', intensity: 'r', spicyEnabledAt: UNLOCKED });
    expect(prompt).not.toBeNull();
    expect(prompt.id.startsWith('spicy-')).toBe(true);
  });

  it('non-spicy categories are never blocked by the spicy lock', () => {
    const prompt = p.getRandomPrompt({
      category: 'party',
      intensity: 'pg13',
      spicyEnabledAt: null,
    });
    expect(prompt).not.toBeNull();
    expect(prompt.id.startsWith('party-')).toBe(true);
  });
});

describe('intensity tier filtering', () => {
  it('pg preset only returns pg prompts', () => {
    for (let i = 0; i < 100; i += 1) {
      const prompt = p.getRandomPrompt({ category: 'funny', intensity: 'pg' });
      expect(prompt.intensity).toBe('pg');
    }
  });

  it('pg13 preset never returns r prompts', () => {
    for (let i = 0; i < 100; i += 1) {
      const prompt = p.getRandomPrompt({ category: 'weird', intensity: 'pg13' });
      expect(['pg', 'pg13']).toContain(prompt.intensity);
    }
  });
});

describe('getPromptById', () => {
  it('returns the exact match for a known id', () => {
    const prompt = p.getPromptById('funny-001');
    expect(prompt).not.toBeNull();
    expect(prompt.id).toBe('funny-001');
  });

  it('returns null for an unknown id', () => {
    expect(p.getPromptById('nope-999')).toBeNull();
  });
});

describe('listCategories and summary', () => {
  it('lists the five categories', () => {
    expect(p.listCategories().sort()).toEqual(['deep', 'funny', 'party', 'spicy', 'weird']);
  });

  it('summaries add up correctly', () => {
    const summary = p.getPackSummary();
    for (const counts of Object.values(summary)) {
      expect(counts.truth + counts.dare).toBe(counts.total);
      expect(counts.intensities.pg + counts.intensities.pg13 + counts.intensities.r).toBe(counts.total);
    }
  });
});