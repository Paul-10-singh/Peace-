/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

function parseFields(raw) {
  const fields = [];
  for (const line of String(raw || '').split('|')) {
    const [name, value] = line.split(';');
    if (name && value) fields.push({ name: name.trim(), value: value.trim(), inline: true });
  }
  return fields.slice(0, 25);
}

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a custom embed to this channel (Owner only)')
    .addStringOption((o) => o.setName('title').setDescription('Embed title').setRequired(true))
    .addStringOption((o) => o.setName('description').setDescription('Embed description').setRequired(false))
    .addStringOption((o) => o.setName('color').setDescription('Hex color, e.g. 00ff88').setRequired(false))
    .addStringOption((o) => o.setName('thumbnail').setDescription('Thumbnail image URL').setRequired(false))
    .addStringOption((o) => o.setName('image').setDescription('Large image URL').setRequired(false))
    .addStringOption((o) => o.setName('footer').setDescription('Footer text').setRequired(false))
    .addStringOption((o) => o.setName('fields').setDescription('Inline fields as "Name;Value|Name;Value"').setRequired(false)),
  async execute(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color');
    const thumbnail = interaction.options.getString('thumbnail');
    const image = interaction.options.getString('image');
    const footer = interaction.options.getString('footer');
    const fields = parseFields(interaction.options.getString('fields'));

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(/^[0-9a-fA-F]{6}$/.test(color || '') ? parseInt(color, 16) : 0x353535)
      .setTimestamp();
    if (description) embed.setDescription(description);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);
    if (footer) embed.setFooter({ text: footer });
    if (fields.length) embed.addFields(fields);

    await interaction.channel.send({ embeds: [embed] });
    return reply(interaction, { embeds: [successEmbed({ description: 'Embed sent.' })], ephemeral: true });
  },
};