/* One-off: uploads the 12 help/auction icons as APPLICATION emojis.
   Skips names that already exist. Prints "<name:id>" codes for the source. */
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ICONS = [
  ['help', 'home.png'], ['help', 'Moderator.gif'],
  ['help', 'security.gif'], ['help', 'owner.png'],
  ['auction', 'kick.png'], ['auction', 'ban.png'], ['auction', 'Nuke.gif'],
  ['auction', 'timeout.png'], ['auction', 'delete.png'],
  ['auction', 'join.png'], ['auction', 'leave.png'],
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('clientReady', async () => {
  try {
    await client.application.fetch();
    const existing = client.application.emojis.cache;
    const codes = [];
    for (const [folder, file] of ICONS) {
      const name = path.parse(file).name.toLowerCase();
      const found = existing.find((e) => e.name === name);
      if (found) {
        codes.push(`<${found.animated ? 'a' : ''}:${found.name}:${found.id}> (skipped)`);
        continue;
      }
      const emoji = await client.application.emojis.create({
        attachment: path.join(__dirname, '..', 'src', 'assets', 'icons', folder, file),
        name,
      });
      codes.push(`<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}> (uploaded)`);
    }
    console.log(codes.join('\n'));
  } catch (err) {
    console.error('Upload failed:', err.message);
  } finally {
    client.destroy();
  }
});
client.login(process.env.DISCORD_TOKEN);
