/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * ============================================================
 *  THE ONLY command-registration entry point in this codebase.
 * ============================================================
 *  Deployment Modes:
 *    1) Guild Scope (instant update, single scope):
 *       node scripts/deploy.js --guild-scope
 *       - Clears global commands (wiped to []) to guarantee ZERO duplicate commands in any server.
 *       - Pushes the full command set to EVERY guild the bot is in.
 *       - Updates in Discord INSTANTLY without the 1-hour global cache delay.
 *
 *    2) Global Scope (default single scope):
 *       node scripts/deploy.js
 *       - Pushes the full command set to GLOBAL scope.
 *       - Wipes guild-scoped commands from all guilds to prevent duplicates.
 *
 *  Run:  npm run deploy [-- --guild-scope | -- --global]
 */
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { loadCommands } = require('./loadCommands');

const GUILD_SCOPE = process.argv.includes('--guild-scope') || process.argv.includes('--guild') || process.argv.includes('--guild-only');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} else {
  console.log('[deploy] No .env found — using daemon-injected environment variables.');
}

async function main() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commands = loadCommands();
  const resolveAppId = async () => {
    if (process.env.CLIENT_ID) return process.env.CLIENT_ID;
    const app = await rest.get('/oauth2/applications/@me');
    console.log(`[deploy] No CLIENT_ID env var — resolved application id from token: ${app.id}`);
    return app.id;
  };

  console.log(`[deploy] Loading ${commands.length} commands from src/commands/...`);
  const resolvedAppId = await resolveAppId();

  if (commands.length > 100) {
    throw new Error(
      `Deploy aborted — ${commands.length} commands exceed Discord's 100 command limit. ` +
        `Add more names to scripts/exclude.js (currently excluded: ${require('./exclude').EXCLUDED_COMMANDS.length}).`
    );
  }

  // Verify command payloads have no duplicates before pushing
  const names = commands.map((c) => c.name);
  const payloadDupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (payloadDupes.length) {
    throw new Error(`Deploy aborted — duplicate command names in payload: ${payloadDupes.join(', ')}`);
  }

  if (GUILD_SCOPE) {
    console.log('[deploy] ⚡ Running GUILD-SCOPE Deployment (Instant update, Zero duplicates)...');

    // Step 1: Wipe global commands so commands do NOT duplicate in guilds
    console.log('[deploy] Step 1: Wiping global scope to prevent duplicate listings...');
    await rest.put(Routes.applicationCommands(resolvedAppId), { body: [] });
    const globalCheck = await rest.get(Routes.applicationCommands(resolvedAppId));
    console.log(`[deploy] ✔ Global scope cleared: ${globalCheck.length} commands remaining.`);

    // Step 2: Fetch all guilds the bot belongs to
    const guilds = await rest.get('/users/@me/guilds');
    console.log(`[deploy] Step 2: Found ${guilds.length} guild(s). Pushing ${commands.length} commands to each guild...`);

    let allSuccess = true;
    for (const guild of guilds) {
      try {
        const putResult = await rest.put(Routes.applicationGuildCommands(resolvedAppId, guild.id), { body: commands });
        console.log(`[deploy] ✔ Guild "${guild.name}" (${guild.id}): ${putResult.length} commands stored instantly.`);

        // Verification
        const stored = await rest.get(Routes.applicationGuildCommands(resolvedAppId, guild.id));
        const guildNames = stored.map((c) => c.name);
        const dupes = guildNames.filter((n, i) => guildNames.indexOf(n) !== i);
        if (stored.length !== commands.length || dupes.length) {
          console.error(`[deploy] ✘ Verification failed for guild "${guild.name}" (${guild.id}): ${stored.length}/${commands.length} stored, dupes: ${dupes.join(', ')}`);
          allSuccess = false;
        }
      } catch (err) {
        console.error(`[deploy] ✘ Failed to deploy to guild "${guild.name}" (${guild.id}):`, err.message);
        allSuccess = false;
      }
    }

    if (!allSuccess) {
      console.error('[deploy] ✘ One or more guilds encountered deployment errors.');
      process.exit(1);
    }

    console.log(`[deploy] 🎉 Successfully deployed ${commands.length} commands to all ${guilds.length} guild(s) with ZERO duplicates!`);
    process.exit(0);
  }

  // ── Default Flow: GLOBAL (single scope) ──────────────────────────────────
  console.log('[deploy] 🌐 Running GLOBAL Deployment...');
  const putResult = await rest.put(Routes.applicationCommands(resolvedAppId), { body: commands });
  console.log(`[deploy] ➜ GLOBAL -> ${putResult.length} commands stored.`);

  // Verify global
  const stored = await rest.get(Routes.applicationCommands(resolvedAppId));
  const storedNames = stored.map((c) => c.name);
  const dupes = storedNames.filter((n, i) => storedNames.indexOf(n) !== i);

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

  // Wipe guild-scoped commands from every guild
  const guilds = await rest.get('/users/@me/guilds');
  let guildClean = true;

  for (const guild of guilds) {
    const guildCommands = await rest.get(Routes.applicationGuildCommands(resolvedAppId, guild.id));
    if (guildCommands.length) {
      await rest.put(Routes.applicationGuildCommands(resolvedAppId, guild.id), { body: [] });
      console.warn(
        `[deploy] ⚠ Found ${guildCommands.length} stale guild-scoped command(s) in guild ` +
          `${guild.name} (${guild.id}) — wiped to enforce the single-scope policy.`
      );
    }
  }

  if (!guildClean) process.exit(1);

  console.log('[deploy] ✔ Done. Single-scope global deploy — every command shows exactly ONCE.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[deploy] ✘ FAILED:', err.stack);
  process.exit(1);
});
