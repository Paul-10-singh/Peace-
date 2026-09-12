/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { errorEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');
const snipe = require('../utils/snipe');

module.exports = {
  name: 'messageDelete',
  async execute(client, message) {
    if (!message.guild) return;

    // Reassign to the fully-fetched message so all properties below are populated.
    if (message.partial) {
      const fetched = await message.fetch().catch(() => null);
      if (!fetched) return;
      message = fetched;
    }

    if (message.author?.bot) return;

    snipe.capture(message);

    const content = message.content || '[embed/attachment only]';
    const embed = errorEmbed({
      title: 'Message Deleted',
      description: content,
      fields: [
        { name: 'Author', value: `${message.author.username} (<@${message.author.id}>)`, inline: true },
        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      ],
      extra: `Message ID: ${message.id}`,
    });

    await sendLog(client, message.guild.id, 'message', { embeds: [embed] });
  },
};
