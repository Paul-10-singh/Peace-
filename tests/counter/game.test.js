'use strict';
/*
 * Peace* -- Discord Bot -- Developed by Smith.Code
 *
 * Counter -- game.test.js (Deliverable 4 / engine tests)
 *
 * Byte-locked to the counter mockup contract (R1-R5). Idiom mirrors
 * tests/counter/evaluator.test.js (vitest describe/it/expect + require
 * the CommonJS module under test). NO invented emoji IDs -- each emoji
 * name resolves through counter/emojis.js which is fed by the shared
 * Peace* registry.
 */

const { describe, it, expect } = require('vitest');
const { createRequire } = require('node:module');
const requireFromHosting = createRequire(require.resolve('../../src/utils/counter/game.js'));

const game = requireFromHosting('../../src/utils/counter/game.js');

function channel(overrides = {}) {
  return {
    mode: 'numbers_only',
    onRuin: 'delete',
    onSuccess: 'react',
    sameUserGuard: true,
    resetBehavior: 'to_zero',
    checkpointEvery: 100,
    current: 20,
    lastCounterId: 'u1',
    best: 20,
    resets: 1,
    ruins: 0,
    paused: false,
    ...overrides,
  };
}

describe('counter/game -- checkMessage', () => {
  it('accepts the exact next number (R1 success)', () => {
    const d = game.checkMessage({
      channelId: 'c1', guildId: 'g1', userId: 'u2',
      number: 21, channel: channel(),
    });
    expect(d.ok).toBe(true);
    expect(d.number).toBe(21);
    expect(d.next).toBe(22);
    expect(d.reactions.length).toBeGreaterThanOrEqual(1);
  });

  it('ruins on a wrong number (R1 fail)', () => {
    const d = game.checkMessage({
      channelId: 'c1', guildId: 'g1', userId: 'u2',
      number: 22, channel: channel(),
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('wrong_number');
    expect(d.ruin).toBe(true);
    expect(d.resetTo).toBe(0);
  });

  it('ruins when the same user counts twice (R2 fail)', () => {
    const d = game.checkMessage({
      channelId: 'c1', guildId: 'g1', userId: 'u1',
      number: 21, channel: channel(),
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('same_user_twice');
    expect(d.ruin).toBe(true);
  });

  it('allows a different user after a same-user ruin', () => {
    const d = game.checkMessage({
      channelId: 'c1', guildId: 'g1', userId: 'u2',
      number: 21, channel: channel({ lastCounterId: null }),
    });
    expect(d.ok).toBe(true);
  });

  it('ruin embed is red 0xED4245 with reset text', () => {
    const r = game.onRuin({
      channelId: 'c1', guildId: 'g1', userId: 'u2',
      number: 22, reason: 'wrong_number',
      channel: channel(),
    });
    expect(r.embed.color).toBe(0xED4245);
    expect(r.resetTo).toBe(0);
    expect(r.deleteOffending).toBe(true);
  });

  it('checkpoint reset behavior resets to the last checkpoint', () => {
    const r = game.onRuin({
      channelId: 'c1', guildId: 'g1', userId: 'u2',
      number: 152, reason: 'wrong_number',
      channel: channel({ resetBehavior: 'to_checkpoint', checkpointEvery: 100, current: 152 }),
    });
    expect(r.resetTo).toBe(100);
  });

  it('milestone fires exactly on the checkpoint multiple', () => {
    const m = game.onMilestone({
      channelId: 'c1', number: 100, channel: channel(),
    });
    expect(m.reached).toBe(true);
    expect(m.nextMilestone).toBe(200);
  });

  it('no milestone below checkpoint or off-multiple', () => {
    expect(game.onMilestone({ channelId: 'c1', number: 99, channel: channel() }).reached).toBe(false);
    expect(game.onMilestone({ channelId: 'c1', number: 150, channel: channel() }).reached).toBe(false);
  });

  it('milestone embed is gold 0xFFD700', () => {
    const m = game.onMilestone({ channelId: 'c1', number: 100, channel: channel() });
    expect(m.embed.color).toBe(0xFFD700);
  });

  it('paused channel returns paused without ruin', () => {
    const d = game.checkMessage({
      channelId: 'c1', guildId: 'g1', userId: 'u2',
      number: 21, channel: channel({ paused: true }),
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('paused');
    expect(d.ruin).toBe(false);
  });

  it('rejects bad channelId with TypeError before logic', () => {
    expect(() => game.checkMessage({
      channelId: '', guildId: 'g1', userId: 'u2',
      number: 21, channel: channel(),
    })).toThrow(TypeError);
  });

  it('rejects non-integer input as invalid_format, delete only in numbers_only', () => {
    const d = game.checkMessage({
      channelId: 'c1', guildId: 'g1', userId: 'u2',
      number: NaN, channel: channel(),
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('invalid_format');
    expect(d.delete).toBe(true);
  });
});

describe('counter/game -- buildSuccessReactions / numberEmojiName', () => {
  it('reacts correct + previous-number emoji', () => {
    const r = game.buildSuccessReactions(channel(), 8);
    expect(r).toContain(game.numberEmojiName(8));
  });

  it('numberEmojiName maps 0-9, null beyond', () => {
    expect(game.numberEmojiName(0)).toBe('zero');
    expect(game.numberEmojiName(9)).toBe('nine');
    expect(game.numberEmojiName(10)).toBeNull();
    expect(game.numberEmojiName(-3)).toBe('three');
  });
});
