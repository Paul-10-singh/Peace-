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

    if (config.enabled) {
      const channel = guild.channels.cache.get(config.channelId);
      if (channel?.isTextBased()) {
        const embed = errorEmbed({
          title: `Goodbye from ${guild.name}!`,
          description: (config.message || 'Goodbye {user}, we will miss you!').replace('{user}', `**${member.user.username}**`),
          thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
          extra: `Member #${guild.memberCount - 1}`,
        });

        channel.send({ embeds: [embed] }).catch(() => {});
      }
    }

    const leftEmbed = errorEmbed({
      title: 'Member Left',
      description: `${member.user.username} (<@${member.id}>) left the server.`,
      extra: `Member #${guild.memberCount - 1}`,
    });

    await sendLog(client, guild.id, 'goodbye', { embeds: [leftEmbed] });
    await updateStats(client, guild);
  },
};
