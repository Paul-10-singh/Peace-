/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { warningEmbed, successEmbed, errorEmbed } = require('../../utils/decorations');

function sanitizeEmojiName(name) {
  return name
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .slice(0, 32)
    .toLowerCase() || 'stolen_emoji';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stealemoji')
    .setDescription('Steal an emoji from another server into this server')
    .addStringOption((o) => o.setName('emoji').setDescription('Server emoji or direct image URL').setRequired(true))
    .addStringOption((o) => o.setName('name').setDescription('Optional name for the new emoji')),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'This command can only be used in a server.' })], ephemeral: true });
    }

    if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers)) {
      return reply(interaction, {
        embeds: [warningEmbed({ description: 'I need the **Manage Emojis and Stickers** permission to add an emoji.' })],
        ephemeral: true,
      });
    }

    const emojiInput = interaction.options.getString('emoji').trim();
    const customName = interaction.options.getString('name');

    const customEmojiMatch = /^<(a?):([^:]+):(\d+)>$/i.exec(emojiInput);
    const urlMatch = /^(https?:\/\/.*\.(?:png|gif|jpg|jpeg))$/i.exec(emojiInput);

    let url;
    let emojiName;

    if (customEmojiMatch) {
      const animated = Boolean(customEmojiMatch[1]);
      emojiName = sanitizeEmojiName(customName || customEmojiMatch[2]);
      const id = customEmojiMatch[3];
      const ext = animated ? 'gif' : 'png';
      url = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
    } else if (urlMatch) {
      emojiName = sanitizeEmojiName(customName || `stolen_${Date.now()}`);
      url = urlMatch[1];
    } else {
      return reply(interaction, {
        embeds: [warningEmbed({ description: 'Please provide a server emoji like `<:name:1234567890>` or a direct image URL ending in `.png`, `.gif`, `.jpg`, or `.jpeg`.' })],
        ephemeral: true,
      });
    }

    try {
      const emoji = await interaction.guild.emojis.create({ attachment: url, name: emojiName });
      const embed = successEmbed({
        title: 'Emoji added',
        description: `Added ${emoji} to this server as **:${emoji.name}:**`,
        thumbnail: emoji.url,
        extra: `Emoji ID: ${emoji.id}`,
      });

      await reply(interaction, { embeds: [embed] });
    } catch (err) {
      console.error('[StealEmoji] error:', err);
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'Could not add that emoji. Make sure the URL is valid and the server has room for more emojis.' })],
        ephemeral: true,
      });
    }
  },
};
