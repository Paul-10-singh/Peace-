/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { addWarn, clearWarns } = require('./settings');
const { errorEmbed } = require('./decorations');
const { sendLog } = require('./logging');

const SCAM_PATTERNS = [
  /(discord|nitro).{0,20}(giveaway|free)/i,
  /(nitro|gift).{0,30}\.ru\b/i,
  /https?:\/\/(free-?nitro|nitro-?gift|discordnitro|steam-?gift|free-?gifts?|give-?away|givaway)[^ ]*/i,
  /steamcommunity\.com\/gifts?[^ ]*/i,
  /https?:\/\/\S+\.xyz\/nitro[^ ]*/i,
  /free\s+discord\s+nitro/i,
  /claim.{0,10}nitro/i,
];

function isScam(text) {
  return SCAM_PATTERNS.some((re) => re.test(text));
}

function containsBlockedWord(text, words) {
  const lower = text.toLowerCase();
  return words.find((w) => lower.includes(w.toLowerCase())) || null;
}

function getLinks(text) {
  return text.match(/https?:\/\/[^\s<]+/gi) || [];
}

// Deletes the offending message, logs a warning and applies the configured
// punishment (warn -> auto-timeout at threshold, or timeout/kick immediately).
async function punish(client, message, config, reason) {
  try { await message.delete(); } catch {}

  const member = message.member;
  const warnCount = addWarn(message.guild.id, message.author.id);
  const threshold = config.warnThreshold || 3;
  let punishment = 'warned';

  if (config.action === 'timeout' || (config.autoWarn !== false && warnCount >= threshold)) {
    if (member && member.moderatable) {
      await member.timeout(10 * 60 * 1000, `Auto-mod: ${reason}`).catch(() => {});
    }
    punishment = 'timed out for 10 minutes';
    clearWarns(message.guild.id, message.author.id);
  } else if (config.action === 'kick' && member?.kickable) {
    await member.kick(`Auto-mod: ${reason}`).catch(() => {});
    punishment = 'kicked';
  }

  const embed = errorEmbed({
    title: 'Auto-Moderation',
    description: `<@${message.author.id}> broke the rules.`,
    fields: [
      { name: 'Reason', value: reason, inline: true },
      { name: 'Action', value: `${punishment} (warning ${warnCount}/${threshold})`, inline: true },
    ],
  });

  const notice = await message.channel.send({ embeds: [embed] }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), 8000);

  await sendLog(client, message.guild.id, 'security', { embeds: [embed] });

  // DM the offender
  if (config.action !== 'warn') {
    try {
      await message.author.send(
        `You were **${punishment}** in **${message.guild.name}**.\nReason: ${reason}`
      );
    } catch {}
  }
}

function checkMessage(message, config) {
  const content = message.content;

  // NOTE: blocked-word hits are handled by the escalating profanity system
  // (src/events/profanity.js + src/utils/profanity.js). This helper only
  // covers scam links and the anti-link filter.

  if (config.antiLink?.blockScam && isScam(content)) {
    return { hit: true, reason: 'posted a scam link' };
  }

  if (config.antiLink?.enabled) {
    const allow = (config.antiLink.allow || []).map((d) => d.toLowerCase().replace(/^https?:\/\//, ''));
    const bad = getLinks(content).filter((link) => {
      try {
        const host = new URL(link).hostname.toLowerCase();
        return !allow.some((d) => host === d || host.endsWith('.' + d));
      } catch {
        return true;
      }
    });
    if (bad.length) return { hit: true, reason: 'posted a link (links are restricted here)' };
  }

  return { hit: false };
}

module.exports = { punish, checkMessage, isScam };