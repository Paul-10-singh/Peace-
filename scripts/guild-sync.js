const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

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

const GUILDS = [
  { id: '1340379968571576341', name: 'TNC OFFICIAL' },
  { id: '1510358429183774910', name: 'PeaceX Hq' },
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const appId = process.env.CLIENT_ID;
  const commands = loadCommands();
  for (const g of GUILDS) {
    const stored = await rest.put(Routes.applicationGuildCommands(appId, g.id), { body: commands });
    console.log(`[guild-sync] ${g.name} (${g.id}) -> ${stored.length} commands (instant).`);
  }
  console.log('Done. Camps sync in seconds.');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
