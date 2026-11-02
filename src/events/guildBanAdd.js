/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { sendLog } = require('../utils/logging');
const { buildBanLog } = require('../utils/logFormatter');

module.exports = {
  name: 'guildBanAdd',
  async execute(client, ban) {
    const { guild, user } = ban;
    if (!guild) return;

    let executor = null;
    let reason = ban.reason || null;
    try {
      const logs = await guild.fetchAuditLogs({ limit: 1, type: 22 }).catch(() => null);
      const entry = logs?.entries?.first();
      if (entry && entry.target?.id === user.id) {
        executor = entry.executor;
        if (!reason && entry.reason) reason = entry.reason;
      }
    } catch {}

    const embed = buildBanLog({
      user,
      executor,
      reason,
      isUnban: false,
    });

    await sendLog(client, guild.id, 'ban', { embeds: [embed] });
  },
};
