/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Timeout Expiry Tracker & Scheduler
 * Manages active member timeouts to ensure an automatic "Timeout Expired"
 * log is posted to the moderation channel the moment a timeout concludes,
 * even if the user is offline or inactive.
 */
const { sendLog } = require('./logging');
const { buildTimeoutLog } = require('./logFormatter');

// Map: "guildId:userId" -> { timer: NodeJS.Timeout, untilTimestamp: number }
const activeTimeouts = new Map();

/**
 * Schedules an automatic expiration log when a member's timeout finishes.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {import('discord.js').GuildMember|object} member
 * @param {number} untilTimestamp
 */
function scheduleTimeoutExpiry(client, guildId, member, untilTimestamp) {
  if (!guildId || !member?.id || !untilTimestamp) return;

  const key = `${guildId}:${member.id}`;
  cancelScheduledTimeout(guildId, member.id);

  const delayMs = untilTimestamp - Date.now();
  if (delayMs <= 0) return;

  // Max 32-bit signed int for setTimeout (approx 24.8 days)
  const MAX_SET_TIMEOUT_MS = 2147483647;
  const timerDelay = Math.min(delayMs, MAX_SET_TIMEOUT_MS);

  const timer = setTimeout(async () => {
    // If clamped because delay > 24.8 days, re-schedule the remainder
    const remaining = untilTimestamp - Date.now();
    if (remaining > 5000) {
      scheduleTimeoutExpiry(client, guildId, member, untilTimestamp);
      return;
    }

    activeTimeouts.delete(key);

    try {
      const guild = client?.guilds?.cache?.get(guildId) || (await client?.guilds?.fetch(guildId).catch(() => null));
      if (!guild) return;

      const targetMember =
        guild.members?.cache?.get(member.id) ||
        (await guild.members?.fetch(member.id).catch(() => null)) ||
        member;

      // Verify the timeout has indeed expired (not extended with a new future timestamp)
      const currentUntil = targetMember?.communicationDisabledUntilTimestamp;
      if (currentUntil && currentUntil > Date.now() + 2000) {
        return; // Extended or renewed
      }

      const embed = buildTimeoutLog({
        member: targetMember,
        type: 'expired',
      });

      await sendLog(client, guildId, 'moderation', { embeds: [embed] });
    } catch (err) {
      // Ignore background logging errors
    }
  }, timerDelay);

  // Unref timer so it doesn't hold open process during tests or shutdown
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  activeTimeouts.set(key, { timer, untilTimestamp });
}

/**
 * Cancels a scheduled timeout expiration log (e.g. if manually removed by a mod).
 * @param {string} guildId
 * @param {string} userId
 */
function cancelScheduledTimeout(guildId, userId) {
  const key = `${guildId}:${userId}`;
  if (activeTimeouts.has(key)) {
    const entry = activeTimeouts.get(key);
    if (entry?.timer) {
      clearTimeout(entry.timer);
    }
    activeTimeouts.delete(key);
    return true;
  }
  return false;
}

/**
 * Checks if a member has a pending timeout expiration schedule.
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean}
 */
function hasScheduledTimeout(guildId, userId) {
  return activeTimeouts.has(`${guildId}:${userId}`);
}

module.exports = {
  scheduleTimeoutExpiry,
  cancelScheduledTimeout,
  hasScheduledTimeout,
  activeTimeouts,
};
