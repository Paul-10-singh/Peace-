/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /setprofile - Updates the bot profile username, avatar, and/or banner (Bot Owner only).
 * Includes strict validation adhering to Discord image guidelines:
 * - Avatar: 128x128 min, recommended 512x512 (1:1 square), max 10 MB, PNG/JPG/WEBP/GIF.
 * - Banner: 600x240 min, recommended 960x540 (16:9) or 680x240 (5:2), max 10 MB, PNG/JPG/WEBP/GIF.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, warningEmbed, errorEmbed } = require('../../utils/decorations');
const { isBotOwner } = require('../../utils/owners');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB Discord limit
const ALLOWED_FORMATS = ['png', 'jpeg', 'jpg', 'webp', 'gif'];

/**
 * Extracts width, height and format from common image headers in pure JS.
 * @param {Buffer} buffer
 * @returns {{ format: string, width: number, height: number }|null}
 */
function getImageDimensions(buffer) {
  if (!buffer || buffer.length < 16) return null;

  // PNG: signature 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return {
      format: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  // GIF: signature GIF87a or GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return {
      format: 'gif',
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  // JPEG: signature FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xFF) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (
        (marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF)
      ) {
        return {
          format: 'jpeg',
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    }
  }

  // WEBP: RIFF....WEBP
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const type = buffer.toString('ascii', 12, 16);
    if (type === 'VP8 ') {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { format: 'webp', width, height };
    }
    if (type === 'VP8L') {
      const b0 = buffer[21];
      const b1 = buffer[22];
      const b2 = buffer[23];
      const b3 = buffer[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { format: 'webp', width, height };
    }
    if (type === 'VP8X') {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { format: 'webp', width, height };
    }
  }

  return null;
}

const DISCORD_GUIDELINES_TEXT =
  '**📋 Discord Image Guidelines:**\n\n' +
  '**📸 Avatar / Logo:**\n' +
  '• Recommended: **512x512 px** (Square 1:1 ratio)\n' +
  '• Minimum: **128x128 px**\n' +
  '• Max Size: **10 MB**\n' +
  '• Allowed Formats: **PNG, JPEG, WEBP, GIF**\n\n' +
  '**🎨 Profile Banner:**\n' +
  '• Recommended: **960x540 px** (16:9) or **680x240 px** (5:2)\n' +
  '• Minimum: **600x240 px**\n' +
  '• Max Size: **10 MB**\n' +
  '• Allowed Formats: **PNG, JPEG, WEBP, GIF**';

/**
 * Downloads and validates an image buffer against Discord rules.
 * @param {string|import('discord.js').Attachment} source
 * @param {'avatar'|'banner'} type
 */
async function fetchAndValidateImage(source, type = 'avatar') {
  let url = '';
  let declaredSize = 0;

  if (typeof source === 'string') {
    url = source.trim();
  } else if (source && typeof source === 'object') {
    url = source.url || source.proxyURL;
    declaredSize = source.size || 0;
  }

  if (!url) {
    return { error: 'Invalid or missing image URL/file.' };
  }

  // Pre-check declared size if attachment
  if (declaredSize > MAX_IMAGE_BYTES) {
    const sizeMb = (declaredSize / (1024 * 1024)).toFixed(2);
    return {
      error:
        `File size too large: **${sizeMb} MB**.\n` +
        `Discord allows a maximum of **10 MB**. Please compress the image.\n\n` +
        DISCORD_GUIDELINES_TEXT,
    };
  }

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (err) {
    return {
      error:
        `Could not download image (${err.message}).\n` +
        `Please ensure the image link is accessible or upload a direct file.`,
    };
  }

  if (!response.ok) {
    return {
      error: `Failed to download image (HTTP ${response.status} ${response.statusText}).`,
    };
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    return { error: 'The downloaded image file is empty (0 bytes).' };
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    return {
      error:
        `File size too large: **${sizeMb} MB**.\n` +
        `Discord allows a maximum of **10 MB**. Please compress the image.\n\n` +
        DISCORD_GUIDELINES_TEXT,
    };
  }

  const info = getImageDimensions(buffer);
  const detectedFormat =
    info?.format ||
    contentType.split('/')[1]?.split('+')[0]?.split(';')[0]?.trim();

  if (!detectedFormat || !ALLOWED_FORMATS.includes(detectedFormat)) {
    return {
      error:
        `Unsupported image format: \`${detectedFormat || 'unknown'}\`.\n` +
        `Discord only accepts **PNG, JPEG, WEBP, or GIF**.\n\n` +
        DISCORD_GUIDELINES_TEXT,
    };
  }

  if (type === 'avatar') {
    if (info && (info.width < 128 || info.height < 128)) {
      return {
        error:
          `Avatar image is too small (**${info.width}x${info.height} px**).\n` +
          `• **Minimum required:** 128x128 px\n` +
          `• **Recommended:** 512x512 px (Square 1:1 ratio)\n\n` +
          DISCORD_GUIDELINES_TEXT,
      };
    }
  }

  if (type === 'banner') {
    if (info && (info.width < 600 || info.height < 240)) {
      return {
        error:
          `Banner image is too small (**${info.width}x${info.height} px**).\n` +
          `• **Minimum required:** 600x240 px\n` +
          `• **Recommended:** 960x540 px (16:9) or 680x240 px (5:2)\n\n` +
          DISCORD_GUIDELINES_TEXT,
      };
    }
  }

  return { buffer, info, sizeBytes: buffer.length };
}

module.exports = {
  botOwnerOnly: true,
  ownerOnly: true,
  getImageDimensions,
  fetchAndValidateImage,
  DISCORD_GUIDELINES_TEXT,
  data: new SlashCommandBuilder()
    .setName('setprofile')
    .setDescription('Update the bot profile username, avatar, and/or banner (Bot Owner only)')
    .addStringOption((o) => o.setName('username').setDescription('New bot username'))
    .addStringOption((o) => o.setName('avatar').setDescription('URL of the new bot avatar image'))
    .addAttachmentOption((o) => o.setName('avatar_file').setDescription('Upload new bot avatar image file directly'))
    .addStringOption((o) => o.setName('banner').setDescription('URL of the new bot banner image'))
    .addAttachmentOption((o) => o.setName('banner_file').setDescription('Upload new bot banner image file directly'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    if (!isBotOwner(interaction.user.id)) {
      return reply(interaction, {
        embeds: [
          warningEmbed({
            title: 'Permission Denied',
            description: 'This command is strictly reserved for the **Bot Owner**.',
          }),
        ],
        ephemeral: true,
      });
    }

    const username = interaction.options.getString('username');
    const avatarUrl = interaction.options.getString('avatar');
    const avatarFile = interaction.options.getAttachment('avatar_file');
    const bannerUrl = interaction.options.getString('banner');
    const bannerFile = interaction.options.getAttachment('banner_file');

    const avatarSource = avatarFile || avatarUrl;
    const bannerSource = bannerFile || bannerUrl;

    if (!username && !avatarSource && !bannerSource) {
      return reply(interaction, {
        embeds: [
          warningEmbed({
            title: 'Nothing to Update',
            description:
              'Please provide at least one option to update:\n' +
              '• `username`\n' +
              '• `avatar` or `avatar_file`\n' +
              '• `banner` or `banner_file`\n\n' +
              DISCORD_GUIDELINES_TEXT,
          }),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });
    const botClient = client || interaction.client;
    const changes = [];

    // 1. Update Username
    if (username) {
      try {
        await botClient.user.setUsername(username);
        changes.push(`username to **${username}**`);
      } catch (err) {
        const isRateLimit = /fast|rate/i.test(err.message || '');
        const desc = isRateLimit
          ? '⏳ Discord Rate Limit: Discord allows changing bot usernames only twice per hour. Please try again later.'
          : err.message || 'Invalid username or Discord rejection.';
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Username Update Failed', description: desc })],
          ephemeral: true,
        });
      }
    }

    // 2. Update Avatar
    if (avatarSource) {
      const result = await fetchAndValidateImage(avatarSource, 'avatar');
      if (result.error) {
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Invalid Avatar Image', description: result.error })],
          ephemeral: true,
        });
      }

      try {
        await botClient.user.setAvatar(result.buffer);
        const dimText = result.info ? ` (${result.info.width}x${result.info.height} px)` : '';
        changes.push(`avatar image${dimText}`);
      } catch (err) {
        const isRateLimit = /fast|rate/i.test(err.message || '');
        const desc = isRateLimit
          ? '⏳ Discord Rate Limit: You are changing the bot avatar too frequently. Please wait a few minutes before trying again.'
          : err.message || 'Failed to update avatar image.';
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Avatar Update Failed', description: desc })],
          ephemeral: true,
        });
      }
    }

    // 3. Update Banner
    if (bannerSource) {
      const result = await fetchAndValidateImage(bannerSource, 'banner');
      if (result.error) {
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Invalid Banner Image', description: result.error })],
          ephemeral: true,
        });
      }

      try {
        await botClient.user.setBanner(result.buffer);
        const dimText = result.info ? ` (${result.info.width}x${result.info.height} px)` : '';
        changes.push(`profile banner${dimText}`);
      } catch (err) {
        const isRateLimit = /fast|rate/i.test(err.message || '');
        const desc = isRateLimit
          ? '⏳ Discord Rate Limit: You are changing the bot banner too frequently. Please wait a few minutes before trying again.'
          : err.message || 'Failed to update bot profile banner. Ensure your bot application supports banners.';
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Banner Update Failed', description: desc })],
          ephemeral: true,
        });
      }
    }

    return reply(interaction, {
      embeds: [
        successEmbed({
          title: 'Bot Profile Updated',
          description: `Successfully updated **${changes.join(' and ')}**.`,
        }),
      ],
      ephemeral: true,
    });
  },
};
