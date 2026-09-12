/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Event listener for the escalating profanity auto-mod system.
 * Registered via the events-map export (see src/index.js). This listener
 * OWNS all blocked-word enforcement; the legacy warning-ladder word check
 * was removed from utils/security.js so nothing double-fires.
 *
 * Gating (mirrors the rest of the security module):
 *  - skipped when /security is off, in ignored channels, for whitelisted
 *    members and for Manage Messages staff
 *  - word list = persistent security.words (/words); if a server never
 *    configured words, a small curated default set is used.
 */
const { get } = require('../utils/settings');
const { checkProfanity, punishProfanity } = require('../utils/profanity');

// Curated starter list used only when a server has no /words configured.
// No identity terms — review/extend per server via `/words add`.
const DEFAULT_WORDS = [
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'bastard', 'cunt',
  'dick', 'dickhead', 'motherfucker', 'whore', 'bollocks',
];

async function handleMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  const config = get(message.guild.id, 'security');
  const profanity = get(message.guild.id, 'profanity');
  if (!config.enabled || !profanity.enabled) return;
  if ((config.ignoredChannels || []).includes(message.channel.id)) return;
  if ((config.whitelist || []).includes(message.author.id)) return;
  if (message.member?.permissions.has('ManageMessages')) return;

  const words = (config.words && config.words.length ? config.words : DEFAULT_WORDS);
  const matched = checkProfanity(message.content, words);
  if (!matched) return;

  try {
    await punishProfanity(client, message, matched);
  } catch (err) {
    console.error('[PeaceX] [Profanity] Handler error:', err);
  }
}

module.exports = {
  name: 'profanity',
  events: {
    messageCreate: handleMessage,
  },
};