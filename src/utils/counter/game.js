'use strict';
/*
 * Peace* -- Discord Bot -- Developed by Smith.Code
 *
 * Counter -- game.js (Deliverable 4 / counting engine)
 *
 * Byte-locked to mockup_counter contract:
 *   checkMessage({channelId, userId, number, channel})
 *     -> { ok:true,  number, reactions, next, isBest, isMilestone }
 *     -> { ok:false, reason:'wrong_number'|'same_user_twice'|
 *                        'invalid_format'|'paused'|'not_configured',
 *          ruin:bool, delete:bool, resetTo, reasonText }
 *   onRuin({channelId, guildId, userId, number, channel})
 *     -> { embed, resetTo, deleteOffending, reason }
 *   onMilestone({channelId, number, channel})
 *     -> { reached:bool, embed?, nextMilestone? }
 *
 * Engine idiom:
 *   - validates EVERY input first (TypeError), never writes on junk
 *   - PURE decision layer: returns a decision object, performs NO
 *     db writes itself -- the caller (event handler / command) owns
 *     the write via counter/store.js prepared statements + tx.
 *   - embed colors: success blurple 0x5865F2, ruin red 0xED4245,
 *     milestone gold 0xFFD700 (byte-locked to mockup).
 */

const E = require('./emojis');

/* ------------------------------------------------------------------ */
/* input guards                                                        */
/* ------------------------------------------------------------------ */

function assertId(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`counter: ${name} must be a non-empty string (got ${JSON.stringify(value)})`);
  }
  return value;
}

function assertChannel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`counter: channel must be a counter_channels row object (got ${JSON.stringify(value)})`);
  }
  return value;
}

function assertNonNegativeInt(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`counter: ${name} must be a non-negative safe integer (got ${JSON.stringify(value)})`);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* number emoji name -- R5 success reaction surface                    */
/* ------------------------------------------------------------------ */

const NUMBER_NAMES = [
  'zero', 'one', 'two', 'three', 'four',
  'five', 'six', 'seven', 'eight', 'nine',
];

function numberEmojiName(number) {
  if (!Number.isSafeInteger(number)) return null;
  const abs = Math.abs(number);
  if (abs > 9) return null;
  return NUMBER_NAMES[abs];
}

function buildSuccessReactions({ channel, number, previousNumber }) {
  if (!channel || channel.onSuccess === 'none') return [];
  return ['1550504846199758928'];
}

/* ------------------------------------------------------------------ */
/* ruin embed                                                          */
/* ------------------------------------------------------------------ */

const RED = 0xED4245;

function buildRuinEmbed({ reason, number, resetTo, next }) {
  const reasonText =
    reason === 'same_user_twice'
      ? 'the same member counted twice in a row.'
      : reason === 'wrong_number'
      ? 'the count jumped the sequence.'
      : 'the counter was reset.';

  return {
    color: RED,
    author: { name: 'Peace* Counter' },
    title: 'Ruin!',
    description: [
      'The chain broke at **' + number + '** because ' + reasonText,
      'The counter resets to **' + resetTo + '**.',
      '',
      'Next number is **' + next + '**.',
    ].join('\n'),
    footer: footer(),
    timestamp: new Date().toISOString(),
  };
}

function footer() {
  return { text: 'Peace* Counter -- Developed by Smith.Code' };
}

/* ------------------------------------------------------------------ */
/* milestone embed                                                     */
/* ------------------------------------------------------------------ */

const GOLD = 0xFFD700;

function buildMilestoneEmbed({ number, nextMilestone, best }) {
  return {
    color: GOLD,
    author: { name: 'Peace* Counter' },
    title: 'Milestone!',
    description: [
      'You reached **' + number + '**!',
      '',
      nextMilestone
        ? 'Next milestone: **' + nextMilestone + '**.'
        : null,
      typeof best === 'number' ? 'All-time best: **' + best + '**.' : null,
    ]
      .filter(Boolean)
      .join('\n'),
    footer: footer(),
    timestamp: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* checkMessage -- the single decision point                            */
/* ------------------------------------------------------------------ */

/*
 * R1  number must equal channel.current + 1            -> wrong_number
 * R2  userId must differ channel.last_counter_id when
 *     same_user_guard is on                            -> same_user_twice
 * R3  non-integer number: numbers_only mode deletes the offending
 *     message; numbers_arithmetic mode reacts only     -> invalid_format
 * R4  on ruin: reset current (to zero or to last
 *     checkpoint multiple) + ruin flag                 -> onRuin
 * R5  on success: reactions [E.correct??, number-emoji]
 */
function checkMessage({ channelId, userId, number, channel }) {
  assertId(channelId, 'channelId');
  assertId(userId, 'userId');
  assertChannel(channel);

  if (channel.paused) {
    return { ok: false, reason: 'paused', ruin: false, delete: false };
  }

  /* R3 -- format gate (precedence over wrong-number) */
  if (!Number.isSafeInteger(number) || number < 0) {
    return {
      ok: false,
      reason: 'invalid_format',
      ruin: false,
      delete: channel.mode === 'numbers_only',
      reasonText: 'Only numbers count here. ' +
        (channel.mode === 'numbers_arithmetic'
          ? 'Try the arithmetic form (e.g. 1+1).'
          : 'Try a single number -- nothing else.'),
    };
  }

  if (number !== channel.current + 1) {
    return {
      ok: false,
      reason: 'wrong_number',
      ruin: true,
      delete: channel.onRuin === 'delete',
      resetTo: resetTarget(channel),
      reasonText: 'Expected **' + (channel.current + 1) + '**, got **' + number + '**.',
    };
  }

  if (channel.sameUserGuard && channel.lastCounterId === userId) {
    return {
      ok: false,
      reason: 'same_user_twice',
      ruin: true,
      delete: channel.onRuin === 'delete',
      resetTo: resetTarget(channel),
      reasonText: 'You counted twice in a row -- the chain resets.',
    };
  }

  const isBest = number > channel.best;
  const isMilestone =
    channel.checkpointEvery > 0 && number % channel.checkpointEvery === 0;

  return {
    ok: true,
    number,
    next: number + 1,
    isBest,
    isMilestone,
    reactions: buildSuccessReactions({ channel, number, previousNumber: number - 1 }),
    embed: isMilestone
      ? buildMilestoneEmbed({ number, nextMilestone: number + channel.checkpointEvery, best: isBest ? number : channel.best })
      : null,
  };
}

function resetTarget(channel) {
  if (channel.resetBehavior === 'to_checkpoint' && channel.checkpointEvery > 0) {
    return Math.floor(channel.current / channel.checkpointEvery) * channel.checkpointEvery;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* onRuin -- pure embed for the ruin event                             */
/* ------------------------------------------------------------------ */

function onRuin({ channelId, guildId, userId, number, channel, reason }) {
  assertId(channelId, 'channelId');
  assertId(guildId, 'guildId');
  assertId(userId, 'userId');
  assertChannel(channel);
  const resetTo = resetTarget(channel);
  
  const reasonText =
    reason === 'same_user_twice'
      ? "You can't count two numbers in a row."
      : reason === 'wrong_number'
      ? "You jumped the sequence."
      : "The counter was reset.";
      
  const content = `<a:wrong:1550504971303395430> <@${userId}> RUINED IT AT **${number}**!! Next number is **${resetTo + 1}**. ${reasonText}`;

  return {
    content,
    embed: buildRuinEmbed({ reason, number, resetTo, next: resetTo + 1 }),
    resetTo,
    deleteOffending: channel.onRuin === 'delete',
  };
}

/* ------------------------------------------------------------------ */
/* onMilestone -- pure embed for milestone events                       */
/* ------------------------------------------------------------------ */

function onMilestone({ channelId, number, channel }) {
  assertId(channelId, 'channelId');
  assertNonNegativeInt(number, 'number');
  assertChannel(channel);
  if (channel.checkpointEvery <= 0 || number % channel.checkpointEvery !== 0) {
    return { reached: false };
  }
  return {
    reached: true,
    nextMilestone: number + channel.checkpointEvery,
    embed: buildMilestoneEmbed({
      number,
      nextMilestone: number + channel.checkpointEvery,
      best: Math.max(number, channel.best),
    }),
  };
}

module.exports = {
  checkMessage,
  onRuin,
  onMilestone,
  buildSuccessReactions,
  numberEmojiName,
};
