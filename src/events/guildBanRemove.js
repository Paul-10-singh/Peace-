/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { sendLog } = require('../utils/logging');
const { buildBanLog } = require('../utils/logFormatter');

module.exports = {
  name: 'guildBanRemove',
  async execute(client, ban) {
    const { guild, user } = ban;
    if (!guild) return;

    let executor = null;
    try {
      const logs = await guild.fetchAuditLogs({ limit: 1, type: 23 }).catch(() => null);
      const entry = logs?.entries?.first();
      if (entry && entry.target?.id === user.id) {
        executor = entry.executor;
      }
    } catch {}

    const embed = buildBanLog({
      user,
      executor,
      isUnban: true,
    });

    await sendLog(client, guild.id, 'ban', { embeds: [embed] });
  },
};
