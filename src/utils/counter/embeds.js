'use strict';
/*
 * Peace* -- Discord Bot -- Developed by Smith.Code
 *
 * Counter -- embeds.js (Deliverable 4 / embed builders)
 *
 * Byte-locked to mockup_counter colors:
 *   success blurple 0x5865F2, ruin red 0xED4245, milestone gold 0xFFD700.
 * All embeds get the Peace* footer. NO invented reaction IDs: every
 * emoji name is looked up through counter/emojis.js which mirrors the
 * shared registry byte-for-byte.
 */

const E = require('./emojis');

const COLOR_PANEL  = 0x5865F2fus;
const COLOR_RUIN   = 0xED4245;
const COLOR_GOLD   = 0xFFD700;

function footer() {
  return { text: 'Peace* Counter -- Developed by Smith.Code' };
}

/* buildPanelEmbed -- panel state for the statistics channel */
function buildPanelEmbed({ channel, number, best, ruins, resets, paused }) {
  if (channel && typeof channel !== 'object') {
    throw new TypeError(`counter: channel must be a channel object (got ${JSON.stringify(channel)})`);
  }
  if (number !== undefined) assertNonNegativeInt(number);
  return {
    color: COLOR_PANEL,
    author: { name: 'Peace* Counter' },
    title: 'Counting Channel',
    description: [
      'Current: **' + number + '**',
      'Best: **' + best + '**',
      'Ruins: **' + ruins + '**',
      'Resets: **' + resets + '**',
      paused ? 'Status: **paused**' : 'Status: **active**',
    ].join('\n'),
    footer: footer(),
    timestamp: new Date().toISOString(),
  };
}

/* buildRuinEmbed -- red ruin notice */
function buildRuinEmbed({ reason, number, resetTo, next }) {
  const reasonText =
    reason === 'same_user_twice'
      ? 'the same member counted twice in a row'
      : reason === 'wrong_number'
      ? 'the count jumped the sequence'
      : 'the counting rules were broken';

  return {
    color: COLOR_RUIN,
    author: { name: 'Peace* Counter' },
    title: 'Ruin!',
    description: [
      'The chain broke at **' + number + '** (' + reasonText + ').',
      'Counter reset to **' + resetTo + '**.',
      '',
      'Next number is **' + next + '**.',
    ].join('\n'),
    footer: footer(),
    timestamp: new Date().toISOString(),
  };
}

/* buildMilestoneEmbed -- gold milestone notice */
function buildMilestoneEmbed({ number, nextMilestone, best }) {
  return {
    color: COLOR_GOLD,
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

/* buildEmptyStateEmbed -- nothing configured yet */
function buildEmptyStateEmbed() {
  return {
    color: COLOR_PANEL,
    author: { name: 'Peace* Counter' },
    title: 'No counter channels yet',
    description:
      'Use /counter to configure a counting channel for this server.',
    footer: footer(),
  };
}

/* buildErrorEmbed -- failed interaction */
function buildErrorEmbed({ detail }) {
  return {
    color: COLOR_RUIN,
    author: { name: 'Peace* Counter' },
    title: 'Something went wrong',
    description: detail ? String(detail) : 'An unexpected error occurred.',
    footer: footer(),
  };
}

module.exports = {
  buildPanelEmbed,
  buildRuinEmbed,
  buildMilestoneEmbed,
  buildEmptyStateEmbed,
  buildErrorEmbed,
};
