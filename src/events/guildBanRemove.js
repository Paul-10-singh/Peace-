/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { successEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');

module.exports = {
  name: 'guildBanRemove',
  async execute(client, ban) {
    const { guild, user } = ban;
    if (!guild) return;

    const embed = successEmbed({
      title: 'Member Unbanned',
      description: `${user.tag} (<@${user.id}>) was unbanned.`,
      extra: `User ID: ${user.id}`,
    });

    await sendLog(client, guild.id, 'moderation', { embeds: [embed] });
  },
};
