/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('serverlist')
    .setDescription('List every server the bot is in (Owner only)'),
  async execute(interaction) {
    const guilds = [...interaction.client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
    if (!guilds.length) return reply(interaction, { embeds: [commandEmbed({ description: 'The bot is in no servers.' })] });

    const lines = guilds.map((g, i) => `${i + 1}. **${g.name}** — ${g.memberCount} members (\`${g.id}\`)`);
    const pages = Math.ceil(lines.length / 25);

    const embed = commandEmbed({
      title: '🌐 Servers',
      description: lines.slice(0, 25).join('\n'),
      extra: `${guilds.length} server${guilds.length === 1 ? '' : 's'}${pages > 1 ? ` · page 1/${pages}` : ''}`,
    });

    return reply(interaction, { embeds: [embed] });
  },
};