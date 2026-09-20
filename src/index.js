/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
require('dotenv').config();
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { ANSI } = require('./utils/decorations');
const { logger } = require('./security/log');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.commands = new Collection();

// Safety net: a single failed API call / reply must never crash the bot.
client.on('error', (err) => console.error(`${ANSI.red}[PeaceX] [×] Client error: ${err.message}${ANSI.reset}`));
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err: err.message, stack: err.stack }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'uncaughtException');
  // best-effort teardown, then a hard exit — never continue in a corrupt state
  try { require('./security/bootstrap').shutdown(); } catch { /* ignore */ }
  setImmediate(() => process.exit(1));
});

// Load commands from commands/**/*.js
const commandsDir = path.join(__dirname, 'commands');
fs.readdirSync(commandsDir, { withFileTypes: true }).forEach((dir) => {
  if (!dir.isDirectory()) return;
  const folder = path.join(commandsDir, dir.name);
  fs.readdirSync(folder).forEach((file) => {
    if (!file.endsWith('.js')) return;
    const command = require(path.join(folder, file));
    if (command?.data?.name) {
      command.__folder = dir.name;
      client.commands.set(command.data.name, command);
    }
  });
});

// Load events from events/*.js
const eventsDir = path.join(__dirname, 'events');
fs.readdirSync(eventsDir).forEach((file) => {
  if (!file.endsWith('.js')) return;
  const event = require(path.join(eventsDir, file));
  if (event.events && typeof event.events === 'object') {
    for (const [name, handler] of Object.entries(event.events)) {
      client.on(name, (...args) => handler(client, ...args));
    }
  } else {
    const name = file.split('.')[0];
    client.on(name, (...args) => event.execute(client, ...args));
  }
});
const { applyCommandGroups } = require('./utils/commandGroups');
applyCommandGroups(client.commands);

// Security platform (2026): ten layers wired into client.security.
const { bootstrap: bootstrapSecurity, shutdown } = require('./security/bootstrap');
bootstrapSecurity(client);
process.once('SIGINT', () => { try { shutdown(); } catch {} process.exit(0); });

// NOTE: Command registration does NOT happen here. Startup only connects to
// the gateway. Registration lives in exactly ONE place: scripts/deploy.js
// (run with `npm run deploy`). Never add registration calls here — mixing
// registration paths caused duplicate commands in the past.
const { printStartupBanner } = require('./utils/decorations');

client.once('clientReady', () => {
  printStartupBanner({ tag: client.user.tag, commandCount: '—', status: 'Online' });
  console.log(`${ANSI.dim}[PeaceX] Ready. Commands are registered via "npm run deploy" (scripts/deploy.js).${ANSI.reset}`);
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error(`${ANSI.red}[PeaceX] [×] Failed to log in: ${err.message}${ANSI.reset}`);
  if (/disallowed intents/i.test(err.message)) {
    console.error('  This bot requests the "Server Members", "Message Content", "Presence" and "Voice States" intents.');
    console.error('  Enable them in the Discord Developer Portal:');
    console.error('  https://discord.com/developers/applications -> your app -> Bot -> Privileged Gateway Intents');
  }
});