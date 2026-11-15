/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * GuildMemberUpdate Event:
 * - Nickname changes -> /setlog nickname
 * - Role changes -> /setlog role
 * - Timeout Applied, Removed, Expired -> /setlog moderation
 */
const logging = require('../utils/logging');
const {
  buildNicknameLog,
  buildRoleUpdateLog,
  buildTimeoutLog,
} = require('../utils/logFormatter');
const {
  scheduleTimeoutExpiry,
  cancelScheduledTimeout,
} = require('../utils/timeoutTracker');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(client, oldMember, newMember) {
    const guild = newMember.guild;
    if (!guild) return;

    // 1. Nickname changes
    if (oldMember && oldMember.nickname !== newMember.nickname) {
      const embed = buildNicknameLog({
        member: newMember,
        oldNick: oldMember.nickname,
        newNick: newMember.nickname,
      });

      await logging.sendLog(client, guild.id, 'nickname', { embeds: [embed] });
    }

    // 2. Timeout changes (applied, removed, expired)
    const oldUntil = oldMember?.communicationDisabledUntilTimestamp || null;
    const newUntil = newMember?.communicationDisabledUntilTimestamp || null;

    if (oldUntil !== newUntil) {
      const now = Date.now();

      // Case A: Timeout Applied or Extended
      if (newUntil && newUntil > now) {
        let executor = null;
        let reason = null;

        try {
          // Audit Log Type 24 = MemberUpdate
          const logs = await guild.fetchAuditLogs({ limit: 5, type: 24 }).catch(() => null);
          const entry = logs?.entries?.find(
            (e) =>
              e.target?.id === newMember.id &&
              e.changes?.some((c) => c.key === 'communication_disabled_until') &&
              Date.now() - e.createdTimestamp < 15000
          );
          if (entry) {
            executor = entry.executor;
            reason = entry.reason;
          }
        } catch {}

        const embed = buildTimeoutLog({
          member: newMember,
          executor,
          reason,
          until: newUntil,
          type: 'applied',
        });

        await logging.sendLog(client, guild.id, 'moderation', { embeds: [embed] });
        scheduleTimeoutExpiry(client, guild.id, newMember, newUntil);
      }
      // Case B: Timeout Removed manually or Expired
      else if (oldUntil && oldUntil > now && (!newUntil || newUntil <= now)) {
        cancelScheduledTimeout(guild.id, newMember.id);

        let executor = null;
        let reason = null;
        let isManual = false;

        try {
          const logs = await guild.fetchAuditLogs({ limit: 5, type: 24 }).catch(() => null);
          const entry = logs?.entries?.find(
            (e) =>
              e.target?.id === newMember.id &&
              e.changes?.some((c) => c.key === 'communication_disabled_until' && !c.new) &&
              Date.now() - e.createdTimestamp < 15000
          );
          if (entry) {
            executor = entry.executor;
            reason = entry.reason;
            isManual = true;
          }
        } catch {}

        if (isManual) {
          const embed = buildTimeoutLog({
            member: newMember,
            executor,
            reason,
            type: 'removed',
          });
          await logging.sendLog(client, guild.id, 'moderation', { embeds: [embed] });
        } else {
          const embed = buildTimeoutLog({
            member: newMember,
            type: 'expired',
          });
          await logging.sendLog(client, guild.id, 'moderation', { embeds: [embed] });
        }
      }
    }

    // 3. Role changes
    if (!oldMember) return;
    const oldRoles = new Set(oldMember.roles?.cache?.keys?.() || []);
    const newRoles = new Set(newMember.roles?.cache?.keys?.() || []);
    const added = [...newRoles].filter((id) => !oldRoles.has(id) && id !== guild.id);
    const removed = [...oldRoles].filter((id) => !newRoles.has(id) && id !== guild.id);
    if (!added.length && !removed.length) return;

    const embed = buildRoleUpdateLog({
      member: newMember,
      added,
      removed,
    });

    await logging.sendLog(client, guild.id, 'role', { embeds: [embed] });
  },
};
