/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { get } = require('../utils/settings');
const { checkMessage, punish } = require('../utils/security');
const { getAfk, isAfk, clearAfk } = require('../utils/afk');
const { tryRunMessageCommand } = require('../utils/messageCmd');

const spamBuckets = new Map(); // guildId -> Map(userId -> timestamps[])
const protectedSayMessages = new Map(); // channelId -> lower-case message text counts

setInterval(() => {
  const now = Date.now();
  for (const [guildId, users] of spamBuckets) {
    for (const [userId, stamps] of users) {
      const fresh = stamps.filter((t) => now - t < 10000);
      if (fresh.length === 0) users.delete(userId);
    }
    if (users.size === 0) spamBuckets.delete(guildId);
  }
}, 30000);

module.exports = {
  name: 'messageCreate',
  protectedSayMessages,
  async execute(client, message) {
    if (!message.guild) return;

    // Remove the library inactivity notice instead of leaving a stale panel message.
    if (message.author.bot) {
      const embedText = (message.embeds || [])
        .flatMap((embed) => [embed.title, embed.description, embed.footer?.text])
        .filter(Boolean)
        .join(' ');
      const text = `${message.content || ''} ${embedText}`.toLowerCase();
      const protectedCount = protectedSayMessages.get(message.channel.id)?.get(text) || 0;
      if (protectedCount > 0) {
        const channelMessages = protectedSayMessages.get(message.channel.id);
        if (protectedCount === 1) channelMessages.delete(text);
        else channelMessages.set(text, protectedCount - 1);
        if (channelMessages.size === 0) protectedSayMessages.delete(message.channel.id);
        return;
      }
      if (text.includes('player destroyed due to inactivity')) {
        await message.delete().catch(() => {});
      }
      return;
    }

    // --- No-prefix message commands: `n <command>` (allowed users only) ---
    if (message.content.startsWith('n ') && (await tryRunMessageCommand(client, message))) {
      return;
    }

    // --- Bot mention reply ---
    // When someone pings the bot (with nothing else, or just the mention),
    // reply with a friendly guide message.
    const isMentionOnly =
      message.mentions.users.has(client.user.id) &&
      message.content.replace(`<@${client.user.id}>`, '').replace(`<@!${client.user.id}>`, '').trim() === '';

    if (isMentionOnly) {
      await message.reply({
        content:
          `👋 **Vanakkam ${message.author.username}!**\n\n` +
          `Solunga, ungaluku naa epdi help pananum? 😊\n\n` +
          `> 📋 All commands parka \`/help\` use pannunga\n` +
          `> 🔍 Specific command info ku \`/help\` use pannunga`,
      }).catch(() => {});
      return;
    }

    // --- AFK system (works even when the security module is off) ---

    // 1. Mentioned/replied-to AFK users: note it in-channel + possibly DM them
    const afkMentions = [];
    for (const mentioned of message.mentions.users.values()) {
      if (mentioned.id === message.author.id) continue;
      if (isAfk(mentioned.id)) afkMentions.push(mentioned);
    }
    if (message.reference?.messageId) {
      const replied = await message.channel
        .messages.fetch(message.reference.messageId)
        .catch(() => null);
      if (replied && replied.author && !afkMentions.some((m) => m.id === replied.author.id) && isAfk(replied.author.id)) {
        afkMentions.push(replied.author);
      }
    }
    if (!message.author.bot && afkMentions.length) {
      for (const target of afkMentions) {
        const entry = getAfk(target.id);
        await message.channel
          .send(`📢 **${target.username}** is currently AFK${entry?.reason && entry.reason !== 'AFK' ? ` — **${entry.reason}**` : ''}.`)
          .catch(() => {});
        if (entry?.dmNotify) {
          await target.send(`**${message.author.username}** mentioned you in ${message.guild.name} while you were AFK.`).catch(() => {});
        }
      }
    }

    // 2. Sender was AFK and just sent a message → clear the AFK status
    if (isAfk(message.author.id)) {
      const ended = clearAfk(message.author.id);
      if (ended) {
        await message.channel
          .send({ content: `<a:butterfly:1550512700327600342> **${message.author.username}**, you sent a message so your AFK has ended.` })
          .catch(() => {});
      }
    }


    const config = get(message.guild.id, 'security');
    if (!config.enabled) return;

    // Ignore listed channels from auto-moderation
    if ((config.ignoredChannels || []).includes(message.channel.id)) return;

    // Whitelisted (trusted) users bypass everything
    if ((config.whitelist || []).includes(message.author.id)) return;

    // Members with Manage Messages are considered staff; still moderate others
    if (message.member?.permissions.has('ManageMessages')) return;

    // 1. Scam links + anti-link (blocked words are handled by the
    //    escalating profanity system - see events/profanity.js)
    const check = checkMessage(message, config);
    if (check.hit) {
      return punish(client, message, config, check.reason);
    }

    // 2. Anti-spam
    if (config.antiSpam?.enabled) {
      if (!spamBuckets.has(message.guild.id)) spamBuckets.set(message.guild.id, new Map());
      const users = spamBuckets.get(message.guild.id);
      const stamps = users.get(message.author.id) || [];
      stamps.push(Date.now());
      users.set(message.author.id, stamps.filter((t) => Date.now() - t < (config.antiSpam.intervalMs || 5000)));

      if (stamps.length >= (config.antiSpam.maxMessages || 5)) {
        users.delete(message.author.id);
        return punish(client, message, config, 'spamming');
      }
    }
  },
};