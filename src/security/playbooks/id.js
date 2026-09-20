/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — incident id entropy helper (crypto-hardened).
 */
const { randomBytes } = require('crypto');

/** N random bytes as hex (URL-safe use). */
function cryptoRandomId(bytes = 3) {
  return randomBytes(bytes).toString('hex');
}

module.exports = { cryptoRandomId };