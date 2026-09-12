/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * ============================================================
 *  THE ONLY command-registration entry point in this codebase.
 * ============================================================
 *  - Registers the full command set in GLOBAL scope only.
 *  - Never registers to any guild scope (that mixed-scope
 *    behavior is what caused duplicate commands in the past).
 *  - Verifies what Discord actually stored right after writing.
 *  - Wipes any stale guild-scoped commands that exist on the
 *    guilds this bot is a member of.
 *
 *  Run:  npm run deploy
 *
 *  DO NOT add any other commands.set() / REST PUT call anywhere
 *  else (src/index.js startup does NOT touch registration).
 */
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

// Same loader the bot itself uses (src/index.js) so counts always match.
function loadCommands() {
  const list = [];
  const commandsDir = path.join(__dirname, '..', 'src', 'commands');
  fs.readdirSync(commandsDir, { withFileTypes: true }).forEach((dir) => {
    if (!dir.isDirectory()) return;
    for (const file of fs.readdirSync(path.join(commandsDir, dir.name))) {
      if (!file.endsWith('.js')) continue;
      const command = require(path.join(commandsDir, dir.name, file));
      if (command?.data?.name) list.push(command.data.toJSON());
    }
  });
  return list;
}

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commands = loadCommands();
  const appId = process.env.CLIENT_ID;
  if (!appId) throw new Error('CLIENT_ID not set in .env');

  console.log(`[deploy] Loading ${commands.length} commands from src/commands/...`);

  // 1) Write the full set to GLOBAL scope. This REPLACES whatever was there
  //    before, so stale global registrations can never accumulate.
  const putResult = await rest.put(Routes.applicationCommands(appId), { body: commands });
  console.log(`[deploy] PUT global -> ${putResult.length} commands stored.`);

  // 2) VERIFY: read back what Discord actually has (not what we sent).
  const stored = await rest.get(Routes.applicationCommands(appId));
  const names = stored.map((c) => c.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);

  if (stored.length !== commands.length) {
    console.error(
      `[deploy] ✘ VERIFICATION FAILED: Discord reports ${stored.length} commands, ` +
        `${commands.length} were sent. Deployment NOT successful.`
    );
    process.exit(1);
  }
  if (dupes.length) {
    console.error(`[deploy] ✘ VERIFICATION FAILED: duplicate command names stored: ${dupes.join(', ')}.`);
    process.exit(1);
  }
  console.log(`[deploy] ✔ Verified: exactly ${stored.length} global commands, no duplicates.`);

  // 3) MIXED-SCOPE GUARD: commands must live in EXACTLY ONE scope (global).
  //    Check every guild this bot is in; wipe any stale guild-scoped
  //    commands (from old deploys) and confirm they stayed wiped.
  const guilds = await rest.get('/users/@me/guilds');
  let guildClean = true;
  for (const guild of guilds) {
    const guildCommands = await rest.get(Routes.applicationGuildCommands(appId, guild.id));
    if (guildCommands.length) {
      await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body: [] });
      console.warn(
        `[deploy] ⚠ Found ${guildCommands.length} stale guild-scoped command(s) in guild ` +
          `${guild.name} (${guild.id}) — wiped to enforce the global-only policy.`
      );
    }
    const recheck = await rest.get(Routes.applicationGuildCommands(appId, guild.id));
    if (recheck.length) {
      guildClean = false;
      console.error(`[deploy] ✘ Guild ${guild.id} still reports ${recheck.length} commands after wipe.`);
    } else {
      console.log(`[deploy] ✔ Guild "${guild.name}" (${guild.id}): 0 guild-scoped commands.`);
    }
  }
  if (!guildClean) process.exit(1);

  console.log('[deploy] ✔ Done. Commands registered in exactly ONE scope (global).');
  console.log('         Note: global changes propagate to all servers, up to ~1 hour.');
  process.exit(0);
})().catch((err) => {
  console.error('[deploy] ✘ FAILED:', err.message);
  process.exit(1);
});