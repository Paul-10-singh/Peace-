/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { EmbedBuilder } = require('discord.js');
const { getAfk, isAfk, clearAfk } = require('../utils/afk');
const { tryRunMessageCommand } = require('../utils/messageCmd');

const protectedSayMessages = new Map(); // channelId -> lower-case message text counts

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

    // --- "You were pinged" DM notification ---
    // DM every non-bot user who was mentioned (excluding the message author).
    try {
      const mentioned = [...message.mentions.users.values()].filter(
        (u) => !u.bot && u.id !== message.author.id
      );
      if (mentioned.length) {
        for (const target of mentioned) {
          const contentStr = message.content.slice(0, 1000) || '*No text content*';
          const notificationMessage = `⠀⠀ 𓂃 ࣪˖ ִֶָ𐀔 [** TNC Official__   __**](https://discord.gg/far7wH9fmP) ﹑  ⋆｡𖦹 ﹒﹢

-# 𐔌 <a:S_buterflies:1552095564659695736> **you've been noticed** ♡ 🫧
-# ꕀ ${message.author.username} (${message.author.id}) <a:butterfly:1550512700327600342>
-# ✦ ${message.guild.name} 🎀🍒
-# ⌗ <a:DMsend:1550504853078409326> <#${message.channel.id}>

-# ⠀⠀"${contentStr}" <:nightmode:1550504911257739305>

-# <a:sq:1552095567759417477> 𓈒 [tap to see the message](${message.url}) 𓂃  <a:sparkles:1550504947953565717>
-# ⠀⠀⠀⠀⠀𓈒 ˙ 𓂃 ୨୧`;

          const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setDescription(notificationMessage);

          await target.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch (err) {
      // Best-effort DM notifications — never crash on any failure
    }


    // --- Counter System Hook ---
    if (!message.author.bot && message.content) {
      const store = require('../utils/counter/store');
      const channelConfig = store.getChannel(message.channel.id);
      
      if (channelConfig && !channelConfig.paused) {
        const game = require('../utils/counter/game');
        let numberVal = NaN;
        
        if (channelConfig.mode === 'numbers_arithmetic' && /^[0-9\s\+\-\*\/\(\)]+$/.test(message.content)) {
           try {
             // eslint-disable-next-line no-eval
             numberVal = eval(message.content);
           } catch(e) {}
        } else if (/^\d+$/.test(message.content.trim())) {
           numberVal = parseInt(message.content.trim(), 10);
        }

        // Only process if they typed what looks like a number attempt.
        if (!Number.isNaN(numberVal) || /^\d+/.test(message.content)) {
          const check = game.checkMessage({
            channelId: message.channel.id,
            userId: message.author.id,
            number: numberVal,
            channel: channelConfig
          });

          if (check.ok) {
            store.recordCount({ channelId: message.channel.id, userId: message.author.id, number: numberVal });
            if (check.reactions && check.reactions.length) {
              for (const r of check.reactions) {
                await message.react(r).catch(() => {});
              }
            }
            if (check.embed) {
              await message.channel.send({ embeds: [check.embed] }).catch(() => {});
            }
            return;
          } else if (check.ruin) {
            const ruinData = game.onRuin({
              channelId: message.channel.id,
              guildId: message.guild.id,
              userId: message.author.id,
              number: numberVal,
              channel: channelConfig,
              reason: check.reason
            });
            store.recordRuin({
              channelId: message.channel.id,
              userId: message.author.id,
              number: numberVal,
              reason: check.reason
            });
            if (ruinData.deleteOffending) {
              await message.delete().catch(() => {});
            }
            await message.channel.send({
              content: ruinData.content,
              embeds: ruinData.embed ? [ruinData.embed] : []
            }).catch(() => {});
            return;
          } else if (check.reason === 'invalid_format' && check.delete) {
            await message.delete().catch(() => {});
            return;
          }
        }
      }
    }

    // --- Security platform (zero-trust + behavior + content analysis) ---
    // All auto-moderation — scam/anti-link/anti-word/anti-spam and the
    // Layer 3 content pipeline — now flows through the gateway so every
    // sample lands in the ledger + behavior baseline.
    const { onMessage } = require('../security/gateway');
    await onMessage(client, message);
  },
};