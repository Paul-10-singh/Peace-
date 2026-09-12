/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Escalating profanity auto-moderation (ported logic from the old Python cog):
 * every message is scanned case-insensitively against the server's persistent
 * blocked-word list (security.words, managed via /words). A hit deletes the
 * message and applies an escalating timeout per user:
 *   1st offense  -> 2 minutes
 *   2nd offense  -> 12 hours
 *   3rd+ offense -> 1 day
 * Offense counts are stored persistently (settings.json "profanity" key,
 * same pattern as the warn counters) so restarts never reset the ladder.
 * A mod-log embed is sent to the "security" log channel (/setlog security)
 * with the user, matched word, offense count and the action result.
 */
const { getOffense, addOffense, clearOffenses } = require('./settings');
const { errorEmbed } = require('./decorations');
const { sendLog } = require('./logging');

// Case-insensitive substring match against the configured word list.
function checkProfanity(content, words) {
  if (!content || !words?.length) return null;
  const lower = content.toLowerCase();
  return words.find((w) => w && lower.includes(String(w).toLowerCase())) || null;
}

// Escalating timeout ladder (ms): 1st / 2nd / 3rd+
const OFFENSE_TIMEOUTS = [2 * 60 * 1000, 12 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];

function timeoutForOffense(count) {
  return count <= 1 ? OFFENSE_TIMEOUTS[0] : count === 2 ? OFFENSE_TIMEOUTS[1] : OFFENSE_TIMEOUTS[2];
}

function formatMs(ms) {
  const minutes = ms / 60000;
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (ms < 24 * 60 * 60 * 1000) return `${ms / (60 * 60 * 1000)} hours`;
  return '1 day';
}

async function punishProfanity(client, message, matchedWord) {
  const guildId = message.guild.id;
  const offense = addOffense(guildId, message.author.id);
  const duration = timeoutForOffense(offense);

  try {
    await message.delete();
  } catch {}

  const member = message.member;
  let actionResult;
  let timeoutApplied = false;

  if (!member) {
    actionResult = 'message deleted — user not cached, timeout skipped';
  } else if (!member.moderatable) {
    // Bot's highest role is below the offender's (or the offender is the
    // guild owner): timeout would throw, so fail gracefully and say so.
    actionResult = 'message deleted — timeout skipped (bot role is below target / insufficient permission)';
  } else if (member.id === message.guild.ownerId) {
    actionResult = 'message deleted — timeout skipped (guild owner)';
  } else {
    try {
      await member.timeout(duration, `Auto-mod profanity: "${matchedWord}"`);
      timeoutApplied = true;
      actionResult = `timed out for ${formatMs(duration)}`;
    } catch (err) {
      actionResult = `message deleted — timeout failed (${err.message})`;
    }
  }

  // Offense ladder is only "spent" by a successfully applied timeout; a failed
  // timeout keeps the count so the next offense escalates again.
  if (timeoutApplied && offense >= 3) clearOffenses(guildId, message.author.id);

  const embed = errorEmbed({
    title: 'Profanity Auto-Moderation',
    description: `<@${message.author.id}> used a blocked word.`,
    fields: [
      { name: 'Matched word', value: `\`${matchedWord}\``, inline: true },
      { name: 'Offense', value: `${offense}`, inline: true },
      { name: 'Action', value: actionResult, inline: false },
    ],
  });

  await sendLog(client, guildId, 'security', { embeds: [embed] });
  return { offense, actionResult };
}

module.exports = { checkProfanity, punishProfanity, timeoutForOffense };