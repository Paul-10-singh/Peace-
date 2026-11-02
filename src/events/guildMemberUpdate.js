/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { sendLog } = require('../utils/logging');
const { buildNicknameLog, buildRoleUpdateLog } = require('../utils/logFormatter');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(client, oldMember, newMember) {
    const guild = newMember.guild;
    if (!guild) return;

    // Nickname changes
    if (oldMember && oldMember.nickname !== newMember.nickname) {
      const embed = buildNicknameLog({
        member: newMember,
        oldNick: oldMember.nickname,
        newNick: newMember.nickname,
      });

      await sendLog(client, guild.id, 'nickname', { embeds: [embed] });
    }

    // Role changes
    if (!oldMember) return;
    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());
    const added = [...newRoles].filter((id) => !oldRoles.has(id) && id !== guild.id);
    const removed = [...oldRoles].filter((id) => !newRoles.has(id) && id !== guild.id);
    if (!added.length && !removed.length) return;

    const embed = buildRoleUpdateLog({
      member: newMember,
      added,
      removed,
    });

    await sendLog(client, guild.id, 'role', { embeds: [embed] });
  },
};
