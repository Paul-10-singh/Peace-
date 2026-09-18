/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * ============================================================
 *  THE ONLY command-registration entry point in this codebase.
 * ============================================================
 *  Default flow — SINGLE SCOPE (commands show exactly ONCE in every server):
 *    1) Push the full set to GLOBAL (reaches every server within ~1h).
 *    2) Wipe guild-scoped commands from ALL guilds (including the two camp
 *       guilds TNC OFFICIAL + PeaceX Hq). No command ever lives in both
 *       guild + global scope, so the slash menu never shows duplicates.
 *
 *  Flags:
 *    --guild-only   push ONLY to the two camp guilds (instant, but each
 *                   command shows a temporary duplicate next to the global
 *                   copy until the next default deploy wipes guild scopes).
 *    --pure-global  same as the default single-scope flow (kept for
 *                   convenience, e.g. the `deploy:global` npm script).
 *
 *  Run:  npm run deploy [-- --guild-only | -- --pure-global]
 *
 *  NOTE: `/refresh` registers the SAME set (via scripts/loadCommands.js) for
 *  a single guild instantly; a subsequent default `npm run deploy` removes
 *  that guild copy. DO NOT add any other commands.set() / REST PUT call
 *  anywhere else (src/index.js startup does NOT touch registration).
 */
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { loadCommands } = require('./loadCommands');

// Same two camps used by scripts/guild-sync.js (guild-only fast path).
const CAMP_GUILDS = [
  { id: '1340379968571576341', name: 'TNC OFFICIAL' },
  { id: '1510358429183774910', name: 'PeaceX Hq' },
];

const GUILD_ONLY = process.argv.includes('--guild-only');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

async function main() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commands = loadCommands();
  const appId = process.env.CLIENT_ID;
  if (!appId) throw new Error('CLIENT_ID not set in .env');

  console.log(`[deploy] Loading ${commands.length} commands from src/commands/...`);

  if (commands.length > 100) {
    throw new Error(
      `Deploy aborted — ${commands.length} commands exceed Discord's 100 global command limit. ` +
        `Add more names to scripts/exclude.js (currently excluded: ${require('./exclude').EXCLUDED_COMMANDS.length}).`
    );
  }

  // ── --guild-only is deprecated ────────────────────────────────────────
  // Guild-scoped copies alongside global copies are exactly what caused
  // duplicate commands in the slash menu. Always use single global scope.
  if (GUILD_ONLY) {
    console.warn(
      '[deploy] ⚠ --guild-only is deprecated. Falling through to the single-scope ' +
        'global deploy so no duplicate commands are created.'
    );
  }

  // ── Step 1: GLOBAL (single scope) ─────────────────────────────────────
  const putResult = await rest.put(Routes.applicationCommands(appId), { body: commands });
  console.log(`[deploy] ➜ GLOBAL -> ${putResult.length} commands stored.`);

  // ── Step 2: VERIFY global ─────────────────────────────────────────────
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

  // ── Step 3: WIPE guild-scoped commands from EVERY guild ───────────────
  // Single-scope policy: a command may not live in guild+global at the same
  // time, otherwise the slash menu shows it twice in that server.
  const guilds = await rest.get('/users/@me/guilds');
  let guildClean = true;

  for (const guild of guilds) {
    const guildCommands = await rest.get(Routes.applicationGuildCommands(appId, guild.id));
    if (guildCommands.length) {
      await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body: [] });
      console.warn(
        `[deploy] ⚠ Found ${guildCommands.length} stale guild-scoped command(s) in guild ` +
          `${guild.name} (${guild.id}) — wiped to enforce the single-scope policy.`
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

  console.log('[deploy] ✔ Done. Single-scope global deploy — every command shows exactly ONCE.');
  console.log('         Reach camp guilds instantly: run `npm run deploy` (global); guild-only deploys');
  console.log('         are disabled because they duplicate commands in the slash menu.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[deploy] ✘ FAILED:', err.message);
  process.exit(1);
});