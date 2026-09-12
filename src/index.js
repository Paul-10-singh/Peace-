/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
require('dotenv').config();
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { ANSI } = require('./utils/decorations');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.commands = new Collection();

// Music engine (discord-player). Singleton attached to the client so all
// commands/events can reach it via client.music.
const { MusicManager } = require('./music/player');
client.music = new MusicManager(client);

// Safety net: a single failed API call / reply must never crash the bot.
client.on('error', (err) => console.error(`${ANSI.red}[PeaceX] [×] Client error: ${err.message}${ANSI.reset}`));
process.on('unhandledRejection', (reason) => {
  console.error(`${ANSI.red}[PeaceX] [×] Unhandled rejection:${ANSI.reset}`, reason);
});
process.on('uncaughtException', (err) => {
  console.error(`${ANSI.red}[PeaceX] [×] Uncaught exception:${ANSI.reset}`, err);
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

// NOTE: Command registration does NOT happen here. Startup only connects to
// the gateway. Registration lives in exactly ONE place: scripts/deploy.js
// (run with `npm run deploy`). Never add registration calls here — mixing
// registration paths caused duplicate commands in the past.
const { printStartupBanner } = require('./utils/decorations');

client.once('clientReady', () => {
  // Warm up the music engine so extractors are loaded before first use.
  try {
    client.music.getPlayer();
  } catch (err) {
    console.error(`${ANSI.red}[PeaceX] [×] Music engine init failed: ${err.message}${ANSI.reset}`);
  }
  printStartupBanner({ tag: client.user.tag, commandCount: '—', status: 'Online' });
  console.log(`${ANSI.dim}[PeaceX] Ready. Commands are registered via "npm run deploy" (scripts/deploy.js).${ANSI.reset}`);
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error(`${ANSI.red}[PeaceX] [×] Failed to log in: ${err.message}${ANSI.reset}`);
  if (/disallowed intents/i.test(err.message)) {
    console.error('  This bot requests the "Server Members" and "Message Content" intents.');
    console.error('  Enable them in the Discord Developer Portal:');
    console.error('  https://discord.com/developers/applications -> your app -> Bot -> Privileged Gateway Intents');
  }
});