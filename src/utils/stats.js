/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { get } = require('./settings');

async function updateStats(client, guild) {
  const cfg = get(guild.id, 'stats');
  if (!cfg.enabled) return;

  const botCount = guild.members.cache.filter((m) => m.user.bot).size;

  const rename = async (id, name) => {
    const channel = guild.channels.cache.get(id);
    if (channel && channel.name !== name) {
      await channel.setName(name).catch(() => {});
    }
  };

  if (cfg.members) {
    await rename(cfg.members, `👥 Members: ${guild.memberCount}`);
  }
  if (cfg.bots) {
    await rename(cfg.bots, `🤖 Bots: ${botCount}`);
  }
}

async function setupStats(guild, categoryId) {
  const category = guild.channels.cache.get(categoryId);
  if (!category) throw new Error('Category channel not found.');

  const members = await guild.channels.create({
    name: `👥 Members: ${guild.memberCount}`,
    type: 2,
    parent: category.id,
    permissionOverwrites: [{ id: guild.id, deny: ['Connect'] }],
  });
  const bots = await guild.channels.create({
    name: '🤖 Bots: 0',
    type: 2,
    parent: category.id,
    permissionOverwrites: [{ id: guild.id, deny: ['Connect'] }],
  });

  return { members: members.id, bots: bots.id, category: category.id };
}

async function disableStats(client, guild) {
  const cfg = get(guild.id, 'stats');
  if (cfg.members) guild.channels.cache.get(cfg.members)?.delete('Stats disabled').catch(() => {});
  if (cfg.bots) guild.channels.cache.get(cfg.bots)?.delete('Stats disabled').catch(() => {});
}

module.exports = { updateStats, setupStats, disableStats };