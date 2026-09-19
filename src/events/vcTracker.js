/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Feeds every voice join / leave / move into the VC activity tracker so
 * /vc stats, /vc custom_stats, /vc task and /vc chart stay current. Runs alongside
 * the temp-VC handler (events/voiceStateUpdate.js).
 */
const vcTracker = require('../utils/vcTracker');

module.exports = {
  name: 'vc-tracker',
  events: {
    voiceStateUpdate(client, oldState, newState) {
      vcTracker.handleVoiceStateUpdate(oldState, newState);
    },
  },
};