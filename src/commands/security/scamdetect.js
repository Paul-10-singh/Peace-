/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { openPanel } = require('../../utils/securityPanel');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { get } = require('../../utils/settings');
const imageGuard = require('../../security/intel/imageGuard');

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif)(\?|#|$)/i;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scamdetect')
    .setDescription('Configure scam detection or block a scam image (SHA-256 + visual dHash)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption((o) =>
      o.setName('image').setDescription('Upload a scam image to block automatically').setRequired(false)
    )
    .addStringOption((o) =>
      o.setName('url').setDescription('Direct image URL to block automatically').setRequired(false)
    )
    .addStringOption((o) =>
      o.setName('label').setDescription('Optional label or reason for this blocked image').setRequired(false).setMaxLength(80)
    ),
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        embeds: [errorEmbed({ description: 'This command can only be used inside a server.' })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const attachment = interaction.options.getAttachment('image');
    const url = interaction.options.getString('url')?.trim() || null;
    const label = interaction.options.getString('label')?.trim() || null;

    if (!attachment && !url) {
      if (label) {
        return interaction.reply({
          embeds: [errorEmbed({ description: 'Please attach an **image** or provide an image **url** along with the label.' })],
          flags: MessageFlags.Ephemeral,
        });
      }
      return openPanel(interaction, 'scamDetect');
    }

    if (attachment) {
      const ct = (attachment.contentType || '').toLowerCase();
      const isImage =
        ct.startsWith('image/') ||
        ((!ct || ct === 'application/octet-stream') && IMAGE_EXT_RE.test(attachment.name || attachment.url || '')) ||
        (!ct && typeof attachment.width === 'number' && attachment.width > 0);
      if (!isImage) {
        return interaction.reply({
          embeds: [errorEmbed({ description: 'Unsupported file type. Please upload an image (PNG, JPG, WEBP, GIF, BMP, AVIF).' })],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const targetUrl = attachment ? attachment.url : url;
    const finalLabel = label || attachment?.name || null;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const { entry, alreadyExists } = await imageGuard.blockFromUrl(interaction.guild.id, targetUrl, {
        label: finalLabel,
        addedBy: interaction.user.id,
      });

      const cfg = get(interaction.guild.id, 'security');
      const notes = [];
      if (entry.low_var) {
        notes.push('Low-detail/solid image detected — exact **SHA-256** matching only (visual dHash skipped to avoid false positives).');
      }
      if (!cfg.enabled) {
        notes.push('Master Security is currently **OFF** — enable it in `/security` so chat images are scanned.');
      } else if (cfg.antiLink?.blockScam === false) {
        notes.push('Scam Detect is currently **OFF** — turn it ON in `/scamdetect` so chat images are scanned.');
      }

      return interaction.editReply({
        embeds: [
          successEmbed({
            title: alreadyExists ? 'Image Already Blocked' : 'Scam Image Blocked',
            description:
              `**ID:** \`#${entry.id}\`${entry.label ? ` · **Label:** ${entry.label}` : ''}\n` +
              `**SHA-256:** \`${entry.sha256.slice(0, 16)}...\`\n` +
              `**dHash (64-bit):** \`${entry.dhash}\`\n` +
              'Anyone posting this exact image or a resized/recompressed copy will be auto-blocked.\n' +
              '*Run `/scamdetect` with no options to manage blocked images.*' +
              (notes.length ? `\n\n> ${notes.join('\n> ')}` : ''),
          }),
        ],
      });
    } catch (err) {
      return interaction.editReply({
        embeds: [errorEmbed({ description: `Could not block image: ${err.message}` })],
      });
    }
  },
};