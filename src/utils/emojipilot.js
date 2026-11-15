/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * EmojiPilot System
 * Automatically reacts with configured emojis when specified users are
 * mentioned (@user) or their messages are replied to.
 * Strictly isolated per server (Guild-specific).
 */
const { get, set } = require('./settings');

// Regex for custom Discord emojis: <:name:id> or animated <a:name:id>
const CUSTOM_EMOJI_REGEX = /^<(a)?:([a-zA-Z0-9_]{2,32}):(\d{17,21})>$/;
const RAW_EMOJI_ID_REGEX = /^(\d{17,21})$/;

/**
 * Validates and extracts emoji details.
 * Supports Unicode emojis and Discord custom emojis (<:name:id>, <a:name:id>).
 * @param {string} raw
 * @returns {{ valid: boolean, display: string, reaction: string, isCustom: boolean }}
 */
function parseEmoji(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, display: '', reaction: '', isCustom: false };
  }

  const str = raw.trim();

  // 1. Custom emoji: <:name:id> or <a:name:id>
  const customMatch = str.match(CUSTOM_EMOJI_REGEX);
  if (customMatch) {
    const isAnimated = Boolean(customMatch[1]);
    const name = customMatch[2];
    const id = customMatch[3];
    return {
      valid: true,
      display: str,
      reaction: id, // Discord.js message.react(id) works for custom emojis
      isCustom: true,
      name,
      id,
      animated: isAnimated,
    };
  }

  // 2. Raw emoji ID
  if (RAW_EMOJI_ID_REGEX.test(str)) {
    return {
      valid: true,
      display: `<:emoji:${str}>`,
      reaction: str,
      isCustom: true,
      id: str,
    };
  }

  // 3. Standard Unicode Emoji (using Unicode Extended_Pictographic property)
  const unicodeEmojiRegex = /\p{Extended_Pictographic}/u;
  if (unicodeEmojiRegex.test(str)) {
    return {
      valid: true,
      display: str,
      reaction: str,
      isCustom: false,
    };
  }

  return { valid: false, display: str, reaction: '', isCustom: false };
}

/**
 * Retrieves the EmojiPilot configuration for a specific guild.
 * @param {string} guildId
 * @returns {{ enabled: boolean, targets: Object.<string, { emoji: string, reaction: string, addedBy: string, addedAt: number }> }}
 */
function getEmojiPilotConfig(guildId) {
  const config = get(guildId, 'emojipilot') || {};
  return {
    enabled: config.enabled !== false,
    targets: config.targets || {},
  };
}

/**
 * Sets or updates an auto-reaction emoji for a targeted user in a guild.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} rawEmoji
 * @param {string} addedById
 * @returns {{ success: boolean, displayEmoji?: string, error?: string }}
 */
function setEmojiPilotTarget(guildId, userId, rawEmoji, addedById = null) {
  const parsed = parseEmoji(rawEmoji);
  if (!parsed.valid) {
    return {
      success: false,
      error: 'Invalid emoji provided. Please provide a standard Unicode emoji (e.g. 🔥, ❤️) or a server custom emoji.',
    };
  }

  const current = getEmojiPilotConfig(guildId);
  current.targets[userId] = {
    emoji: parsed.display,
    reaction: parsed.reaction,
    isCustom: parsed.isCustom,
    addedBy: addedById,
    addedAt: Date.now(),
  };

  set(guildId, 'emojipilot', current);
  return { success: true, displayEmoji: parsed.display, reaction: parsed.reaction };
}

/**
 * Removes an auto-reaction target in a guild.
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean} Whether the target was found and removed
 */
function removeEmojiPilotTarget(guildId, userId) {
  const current = getEmojiPilotConfig(guildId);
  if (!current.targets[userId]) return false;

  delete current.targets[userId];
  set(guildId, 'emojipilot', current);
  return true;
}

/**
 * Clears all EmojiPilot targets for a guild.
 * @param {string} guildId
 * @returns {number} Number of cleared targets
 */
function clearEmojiPilot(guildId) {
  const current = getEmojiPilotConfig(guildId);
  const count = Object.keys(current.targets).length;
  current.targets = {};
  set(guildId, 'emojipilot', current);
  return count;
}

/**
 * Handles message creation and triggers EmojiPilot auto-reactions.
 * Scans for:
 * 1) Mentions of targeted users (@user).
 * 2) Replies to messages authored by targeted users.
 * @param {import('discord.js').Message} message
 */
async function handleEmojiPilotMessage(message) {
  if (!message?.guild || message.author?.bot) return;

  const config = getEmojiPilotConfig(message.guild.id);
  if (!config.enabled || !config.targets || Object.keys(config.targets).length === 0) {
    return;
  }

  const reactionsToApply = new Set();
  const authorId = message.author.id;

  // Trigger 1: Tag / Mention (@user)
  if (message.mentions?.users?.size > 0) {
    for (const [targetId] of message.mentions.users) {
      if (targetId !== authorId && config.targets[targetId]) {
        reactionsToApply.add(config.targets[targetId].reaction);
      }
    }
  }

  // Trigger 2: Reply to a user's message
  if (message.reference?.messageId) {
    let repliedUserId = message.mentions?.repliedUser?.id;

    if (!repliedUserId && message.channel?.messages?.fetch) {
      const referencedMsg = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch(() => null);
      if (referencedMsg?.author) {
        repliedUserId = referencedMsg.author.id;
      }
    }

    if (repliedUserId && repliedUserId !== authorId && config.targets[repliedUserId]) {
      reactionsToApply.add(config.targets[repliedUserId].reaction);
    }
  }

  // Apply reactions
  if (reactionsToApply.size > 0) {
    for (const emoji of reactionsToApply) {
      try {
        await message.react(emoji);
      } catch (err) {
        // Silently catch missing reaction permissions or unavailable custom emojis
      }
    }
  }
}

module.exports = {
  parseEmoji,
  getEmojiPilotConfig,
  setEmojiPilotTarget,
  removeEmojiPilotTarget,
  clearEmojiPilot,
  handleEmojiPilotMessage,
};
