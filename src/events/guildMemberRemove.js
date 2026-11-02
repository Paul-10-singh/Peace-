/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { get } = require('../utils/settings');
const { updateStats } = require('../utils/stats');
const { sendLog } = require('../utils/logging');

module.exports = {
  name: 'guildMemberRemove',
  async execute(client, member) {
    const { errorEmbed } = require('../utils/decorations');
    const guild = member.guild;
    const config = get(guild.id, 'farewell');

    const welcomeUtil = require('../utils/welcome');
    if (config.enabled !== false) {
      const exitChannel = welcomeUtil.resolveExitChannel(guild, config);
      if (exitChannel?.isTextBased()) {
        const payload = welcomeUtil.buildExitPayload({
          guild,
          user: member.user,
          memberCount: guild.memberCount,
        });

        exitChannel.send(payload).catch((err) => {
          console.error(`[PeaceX] [Exit] Could not send exit message:`, err.message);
        });
      }
    }

    const { buildMemberLeaveLog } = require('../utils/logFormatter');
    const roles = member.roles?.cache ? [...member.roles.cache.values()].filter((r) => r.id !== guild.id) : [];
    const leftEmbed = buildMemberLeaveLog({
      member,
      roles,
    });

    await sendLog(client, guild.id, 'exit', { embeds: [leftEmbed] });
    await updateStats(client, guild);
  },
};
