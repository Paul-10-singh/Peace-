/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Auto-responder storage + runtime.
 * data/autoresponder.json -> { [guildId]: [ { trigger, response } ] }
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'autoresponder.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');

let cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function getRules(guildId) {
  if (!Array.isArray(cache[guildId])) cache[guildId] = [];
  return cache[guildId];
}

function addRule(guildId, trigger, response) {
  const rules = getRules(guildId);
  if (rules.some((r) => r.trigger.toLowerCase() === trigger.toLowerCase())) return { added: false };
  rules.push({ trigger, response });
  persist();
  return { added: true };
}

function removeRule(guildId, trigger) {
  const rules = getRules(guildId);
  const index = rules.findIndex((r) => r.trigger.toLowerCase() === trigger.toLowerCase());
  if (index === -1) return { removed: false };
  const [removed] = rules.splice(index, 1);
  persist();
  return { removed: true, rule: removed };
}

async function tryRespond(client, message) {
  if (message.author.bot || !message.guild) return;
  const rules = getRules(message.guild.id);
  if (!rules.length) return;
  const content = message.content.toLowerCase();
  const match = rules.find((r) => content.includes(r.trigger.toLowerCase()));
  if (!match) return;
  await message.channel.send(match.response).catch(() => {});
}

module.exports = { getRules, addRule, removeRule, tryRespond };
