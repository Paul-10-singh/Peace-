/*
 * Peace✘ - Single-scope cleanup.
 *
 * The single-scope policy: every command lives ONLY in the global scope. Any
 * guild-scoped copy produces a duplicate next to the global one in that
 * server's slash menu. This script wipes guild-scoped commands from every
 * guild the bot can see, and verifies no duplicates remain anywhere.
 *
 * Run:  npm run deploy:guild
 */
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const appId = process.env.CLIENT_ID;
  const globalCommands = await rest.get(Routes.applicationCommands(appId));
  const globalNames = globalCommands.map((c) => c.name);
  const globalDupes = globalNames.filter((n, i) => globalNames.indexOf(n) !== i);
  if (globalDupes.length) {
    console.error(`[guild-sync] ✘ Global scope already has duplicate names: ${globalDupes.join(', ')}.`);
    process.exit(1);
  }

  console.log(`[guild-sync] Global scope clean (${globalNames.length} commands, no duplicates).`);

  const guilds = await rest.get('/users/@me/guilds');
  let wiped = 0;
  for (const g of guilds) {
    const guildCommands = await rest.get(Routes.applicationGuildCommands(appId, g.id));
    if (guildCommands.length) {
      await rest.put(Routes.applicationGuildCommands(appId, g.id), { body: [] });
      wiped += guildCommands.length;
      console.warn(`[guild-sync] ⚠ Wiped ${guildCommands.length} guild-scoped command(s) in ${g.name} (${g.id}).`);
    }
  }
  console.log(`[guild-sync] Done. Wiped ${wiped} guild-scoped command(s) — every command now shows exactly once.`);
  process.exit(0);
})().catch((e) => {
  console.error('[guild-sync] ✘ FAILED:', e.message);
  process.exit(1);
});