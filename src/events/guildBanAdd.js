/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { errorEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');

module.exports = {
  name: 'guildBanAdd',
  async execute(client, ban) {
    const { guild, user } = ban;
    if (!guild) return;

    const embed = errorEmbed({
      title: 'Member Banned',
      description: `${user.tag} (<@${user.id}>) was banned.`,
      extra: `User ID: ${user.id}`,
    });

    await sendLog(client, guild.id, 'moderation', { embeds: [embed] });
  },
};
