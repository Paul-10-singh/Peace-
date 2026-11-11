/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { sendLog } = require('../utils/logging');
const { buildMessageEditLog } = require('../utils/logFormatter');
const { onMessageImages } = require('../security/gateway');

module.exports = {
  name: 'messageUpdate',
  async execute(client, oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;

    if (newMessage.partial) {
      const fetched = await newMessage.fetch().catch(() => null);
      if (!fetched) return;
    }

    const contentChanged = oldMessage?.content !== newMessage.content;
    const embedsAdded = (newMessage.embeds?.length || 0) > (oldMessage?.embeds?.length || 0);
    if (!contentChanged && !embedsAdded) return;

    // Catch edited messages or delayed Discord embed unfurls containing blocked scam images
    const imgCheck = await onMessageImages(client, newMessage).catch(() => ({ action: 'safe' }));
    if (imgCheck.action === 'blocked') return;

    if (!contentChanged) return;

    const embed = buildMessageEditLog({
      oldMessage,
      newMessage,
      author: newMessage.author,
      channel: newMessage.channel,
    });

    await sendLog(client, newMessage.guild.id, 'message', { embeds: [embed] });
  },
};
