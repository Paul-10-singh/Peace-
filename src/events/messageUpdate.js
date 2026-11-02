/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { sendLog } = require('../utils/logging');
const { buildMessageEditLog } = require('../utils/logFormatter');

module.exports = {
  name: 'messageUpdate',
  async execute(client, oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;

    if (newMessage.partial) {
      const fetched = await newMessage.fetch().catch(() => null);
      if (!fetched) return;
    }

    if (oldMessage?.content === newMessage.content) return;

    const embed = buildMessageEditLog({
      oldMessage,
      newMessage,
      author: newMessage.author,
      channel: newMessage.channel,
    });

    await sendLog(client, newMessage.guild.id, 'message', { embeds: [embed] });
  },
};
