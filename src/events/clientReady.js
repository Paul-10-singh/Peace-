/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Client ready — cache invite tracking and rotate the bot's presence the
 * same way the Pro build does: a "Trusted By <N> Users" line (formatted
 * K/M/B) mixed with quick command hints, refreshed every 10s.
 */
const { ActivityType } = require('discord.js');
const { init } = require('../utils/inviteCache');
const vcTracker = require('../utils/vcTracker');

// Format a number like the Pro bot (1.2K / 3.4M / 5.6B).
function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function totalUsers(client) {
  return client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
}

module.exports = {
  name: 'ready',
  async execute(client) {
    await init(client);

    const statuses = [
      () => `tag for help`,
      () => `ɪᴛ's ᴛɪᴍᴇ ᴛᴏ ғʟʏ`,
      () => `Trusted By ${fmtCount(totalUsers(client))} Users`,
    ];

    const rotate = () => {
      try {
        const pick = statuses[Math.floor(Math.random() * statuses.length)];
        const result = client.user.setActivity(pick(), { type: ActivityType.Listening });
        if (result && typeof result.then === 'function') result.catch(() => {});
      } catch {
        /* ignore presence errors */
      }
    };
    rotate();
    setInterval(rotate, 10_000);

    // VC activity tracking: seed members already in voice, then schedule the
    // weekly Sunday 11 PM owner report.
    try {
      vcTracker.seedActiveSessions(client);
      vcTracker.startWeeklyReportScheduler(client);
    } catch (err) {
      console.error(`[PeaceX] [vcTracker] Failed to start: ${err.message}`);
    }
  },
};