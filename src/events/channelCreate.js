/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { successEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');

const CHANNEL_TYPES = {
  0: 'Text',
  2: 'Voice',
  4: 'Category',
  5: 'Announcement',
  13: 'Stage',
  15: 'Forum',
};

module.exports = {
  name: 'channelCreate',
  async execute(client, channel) {
    if (!channel.guild) return;

    const embed = successEmbed({
      title: 'Channel Created',
      description:
        `Channel **${channel.name}** (<#${channel.id}>) was created.\n` +
        `**Type:** ${CHANNEL_TYPES[channel.type] || channel.type}`,
      extra: `Channel ID: ${channel.id}`,
    });

    await sendLog(client, channel.guild.id, 'utility', { embeds: [embed] });
  },
};
