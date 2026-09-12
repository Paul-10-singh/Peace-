/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { warningEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');

module.exports = {
  name: 'messageUpdate',
  async execute(client, oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;

    if (newMessage.partial) {
      const fetched = await newMessage.fetch().catch(() => null);
      if (!fetched) return;
    }

    if (oldMessage?.content === newMessage.content) return;

    const embed = warningEmbed({
      title: 'Message Edited',
      description: `[Jump to message](https://discord.com/channels/${newMessage.guild.id}/${newMessage.channel.id}/${newMessage.id})`,
      fields: [
        { name: 'Before', value: (oldMessage?.content || '[embed/attachment only]').slice(0, 1024) || '*(empty)*' },
        { name: 'After', value: (newMessage.content || '[embed/attachment only]').slice(0, 1024) || '*(empty)*' },
      ],
      extra: `${newMessage.author.tag} | ${newMessage.id}`,
    });

    await sendLog(client, newMessage.guild.id, 'message', { embeds: [embed] });
  },
};
