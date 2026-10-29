/*
 * Peace✘ - Standalone Reaction Role Sync Script
 * Developed by Smith.Code
 *
 * Usage:
 *   node scripts/syncReactions.js <message_id> [channel_id]
 *
 * What this does:
 * 1. Connects to Discord using DISCORD_TOKEN from .env.
 * 2. Fetches the self-role message and its reactions.
 * 3. Auto-detects or reads role bindings from settings.json.
 * 4. Checks every user who reacted and gives them the missing roles!
 * 5. Saves bindings permanently into data/settings.json.
 */
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { normalizeEmoji, buildKey } = require('../src/events/reactionRoles');
const settings = require('../src/utils/settings');

// Load environment variables
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const targetMessageId = process.argv[2];
const targetChannelId = process.argv[3];

if (!targetMessageId) {
  console.log('Usage: node scripts/syncReactions.js <message_id> [channel_id]');
  console.log('Example: node scripts/syncReactions.js 123456789012345678');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
});

client.once('clientReady', async () => {
  console.log(`[Sync] Logged in as ${client.user.tag}`);

  let foundMessage = null;
  let foundChannel = null;

  // If channelId is provided, fetch directly
  if (targetChannelId) {
    try {
      foundChannel = await client.channels.fetch(targetChannelId);
      foundMessage = await foundChannel.messages.fetch(targetMessageId);
    } catch (err) {
      console.error(`[Sync] Could not find message in channel ${targetChannelId}:`, err.message);
    }
  } else {
    // Search across text channels in all guilds
    console.log(`[Sync] Searching for message ${targetMessageId} across channels...`);
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isTextBased()) continue;
        try {
          const msg = await channel.messages.fetch(targetMessageId).catch(() => null);
          if (msg) {
            foundMessage = msg;
            foundChannel = channel;
            break;
          }
        } catch {}
      }
      if (foundMessage) break;
    }
  }

  if (!foundMessage) {
    console.error(`[Sync] ❌ Message with ID "${targetMessageId}" could not be found.`);
    client.destroy();
    process.exit(1);
  }

  const guild = foundMessage.guild;
  console.log(`[Sync] ✔ Found message in #${foundChannel.name} (${guild.name})`);

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me.permissions.has('ManageRoles')) {
    console.error('[Sync] ❌ Bot lacks "Manage Roles" permission!');
    client.destroy();
    process.exit(1);
  }

  const allRoles = await guild.roles.fetch();
  const list = settings.get(guild.id, 'reactionroles') || [];
  const lines = (foundMessage.content || '').split(/\r?\n/);

  // 1. Scan message text for roles and emojis if not already in settings
  const detectedBindings = [];
  for (const line of lines) {
    if (!line.trim()) continue;

    let foundRole = null;
    const roleMentionMatch = line.match(/<@&(\d+)>/);
    if (roleMentionMatch) {
      foundRole = allRoles.get(roleMentionMatch[1]);
    } else {
      const namePattern = line.match(/@\.?\s*([^.\n\r]+?)\s*\.?$/);
      if (namePattern) {
        const rawName = namePattern[1].trim().toLowerCase();
        foundRole = allRoles.find(
          (r) =>
            r.name.toLowerCase() === rawName ||
            r.name.toLowerCase() === `. ${rawName} .` ||
            r.name.toLowerCase().replace(/[@. ]/g, '') === rawName.replace(/[@. ]/g, '')
        );
      }
    }

    if (!foundRole) continue;

    let emojiKey = null;
    let emojiDisplay = null;
    const customEmoji = line.match(/<a?:([\w~]+):(\d+)>/);
    if (customEmoji) {
      emojiKey = `custom:${customEmoji[2]}`;
      emojiDisplay = customEmoji[0];
    } else {
      const unicodeEmojis = line.match(/\p{Extended_Pictographic}/gu);
      if (unicodeEmojis && unicodeEmojis.length > 0) {
        emojiKey = `unicode:${unicodeEmojis[0].replace(/[\uFE00-\uFE0F\u200D]/g, '').trim()}`;
        emojiDisplay = unicodeEmojis[0];
      }
    }

    if (foundRole && emojiKey) {
      detectedBindings.push({ role: foundRole, emojiKey, emojiDisplay });
      const fullKey = `${foundChannel.id}:${foundMessage.id}:${emojiKey}`;
      const existingIdx = list.findIndex((e) => e.key === fullKey);
      if (existingIdx !== -1) {
        list[existingIdx].roleId = foundRole.id;
      } else {
        list.push({ key: fullKey, roleId: foundRole.id });
      }
    }
  }

  // Save updated bindings to settings
  settings.set(guild.id, 'reactionroles', list);
  console.log(`[Sync] ✔ Registered ${list.length} reaction bindings for guild "${guild.name}"`);

  // 2. Iterate reactions and sync missing roles
  let totalAdded = 0;
  let totalHad = 0;
  let totalSkipped = 0;

  for (const reaction of foundMessage.reactions.cache.values()) {
    const norm = normalizeEmoji(reaction.emoji);
    const binding = list.find((e) => {
      const parts = e.key.split(':');
      if (parts.length >= 4 && parts[1] === foundMessage.id) {
        return `${parts[2]}:${parts[3]}` === norm;
      }
      return false;
    });

    if (!binding) {
      console.log(`[Sync] ⚠️  No role bound for emoji ${reaction.emoji.name}`);
      continue;
    }

    const role = allRoles.get(binding.roleId);
    if (!role) {
      console.log(`[Sync] ❌ Role ID ${binding.roleId} not found`);
      continue;
    }

    if (role.position >= me.roles.highest.position) {
      console.log(`[Sync] ❌ Role "${role.name}" is above bot role in hierarchy! Cannot assign.`);
      continue;
    }

    let users;
    try {
      users = await reaction.users.fetch();
    } catch {
      users = reaction.users.cache;
    }

    let addedForThis = 0;
    let hadForThis = 0;

    for (const [userId, userObj] of users) {
      if (userObj.bot) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      if (member.roles.cache.has(role.id)) {
        hadForThis += 1;
        totalHad += 1;
      } else {
        try {
          await member.roles.add(role.id, 'Reaction role sync');
          addedForThis += 1;
          totalAdded += 1;
        } catch (err) {
          console.error(`[Sync] Failed to add ${role.name} to ${member.user.tag}:`, err.message);
        }
      }
    }

    console.log(`[Sync] ✔ ${reaction.emoji.name} ➔ "${role.name}": +${addedForThis} assigned (already had: ${hadForThis})`);
  }

  console.log('\n========================================');
  console.log(`[Sync] Completed! Total new roles assigned: ${totalAdded}, already had: ${totalHad}`);
  console.log('========================================');

  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[Sync] Login failed:', err.message);
  process.exit(1);
});
