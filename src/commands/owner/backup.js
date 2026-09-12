/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /backup - export this server's structure and bot settings as JSON (Owner
 * only). Full server-to-server cloning is covered by the existing /clone
 * command; this is a portable config snapshot.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const settings = require('../../utils/settings');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Export the server structure + bot settings as a JSON snapshot (Owner only)'),
  async execute(interaction) {
    const guild = interaction.guild;

    try {
      const [roles, channels, emojis, bans] = await Promise.all([
        guild.roles.fetch().catch(() => new Map()),
        guild.channels.fetch().catch(() => new Map()),
        guild.emojis.fetch().catch(() => new Map()),
        guild.bans.fetch().catch(() => new Map()),
      ]);

      const snapshot = {
        server: {
          name: guild.name,
          id: guild.id,
          memberCount: guild.memberCount,
          createdAt: guild.createdAt.toISOString(),
        },
        roles: [...roles.values()].map((r) => ({
          name: r.name,
          permissions: r.permissions.toArray(),
          color: r.hexColor,
          hoist: r.hoist,
          mentionable: r.mentionable,
          position: r.position,
        })),
        channels: [...channels.values()].map((c) => ({
          name: c.name,
          type: c.type,
          parentId: c.parentId,
          position: c.position,
        })),
        emojis: [...emojis.values()].map((e) => ({ name: e.name, id: e.id, animated: e.animated })),
        bannedUsers: bans.size,
        botSettings: settings.getGuild(guild.id),
      };

      const json = JSON.stringify(snapshot, null, 2);
      const buffer = Buffer.from(json, 'utf8');

      await reply(interaction, {
        embeds: [
          successEmbed({
            title: '📦 Server backup',
            description: `Captured **${roles.size}** roles, **${channels.size}** channels, **${emojis.size}** emojis and your bot settings (${buffer.length.toLocaleString()} bytes).`,
          }),
        ],
        files: [{ attachment: buffer, name: `backup-${guild.name.replace(/[^\w-]+/g, '_')}-${Date.now()}.json` }],
      });
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
    }
  },
};