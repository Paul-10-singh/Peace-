/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /clone all - copy every emoji (incl. animated GIFs) and sticker from a
 * target server into this one (or another), identified purely by server ID.
 *
 *   /clone all <source> [destination]
 *
 * - source:      the server ID to COPY FROM (the bot must be in it)
 * - destination: the server ID to paste into (defaults to the current server)
 *
 * Emoji slot caps and sticker boosts apply (Discord limits); anything that
 * cannot fit is skipped and reported. Animated emojis are copied as GIFs.
 */
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, errorEmbed, successEmbed } = require('../../utils/decorations');

function cleanName(name, max) {
  const cleaned = (name || 'emoji').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, max);
  return cleaned || 'sticker';
}

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('clone')
    .setDescription('Copy emojis + stickers from one server to another by ID (Owner only)')
    .addSubcommand((s) =>
      s
        .setName('all')
        .setDescription('Copy all emojis/stickers/GIFs from a source server')
        .addStringOption((o) => o.setName('source').setDescription('Source server ID to copy FROM').setRequired(true))
        .addStringOption((o) => o.setName('destination').setDescription('Destination server ID (defaults to this server)')))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
  async execute(interaction) {
    const sourceId = interaction.options.getString('source');
    const destId = interaction.options.getString('destination');
    const client = interaction.client;

    const sourceGuild = client.guilds.cache.get(sourceId);
    if (!sourceGuild) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `I am not in the source server \`${sourceId}\` — add me there first.` })],
        ephemeral: true,
      });
    }

    const destination = destId ? client.guilds.cache.get(destId) : interaction.guild;
    if (!destination) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `I am not in the destination server \`${destId}\`.` })],
        ephemeral: true,
      });
    }

    if (!destination.members.me?.permissions.has(PermissionsBitField.Flags.ManageExpressions)) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `I need **Manage Expressions** permission in **${destination.name}** to create emojis/stickers there.` })],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const emojis = await sourceGuild.emojis.fetch().catch(() => new Map());
    const stickers = await sourceGuild.stickers.fetch().catch(() => new Map());

    let copiedEmojis = 0;
    let copiedStickers = 0;
    const skipped = [];

    // ── Emojis (static + animated GIFs) ──────────────────────────────
    // Per-type slots grow with boost tier: 50/100/150/200 (x2 for total).
    const perType = 50 * (destination.premiumTier + 1);
    for (const emoji of emojis.values()) {
      const currentStatic = destination.emojis.cache.filter((e) => !e.animated).size;
      const currentAnimated = destination.emojis.cache.filter((e) => e.animated).size;
      if ((emoji.animated ? currentAnimated : currentStatic) >= perType) {
        skipped.push(`:${emoji.name}: (emoji slots full)`);
        continue;
      }
      try {
        const url = emoji.imageURL({ size: 128, extension: emoji.animated ? 'gif' : 'png' });
        await destination.emojis.create({
          attachment: url,
          name: cleanName(emoji.name, 32),
          reason: `Peace✘ /clone all from ${sourceGuild.name}`,
        });
        copiedEmojis += 1;
      } catch (err) {
        skipped.push(`:${emoji.name}: (${err.message})`);
      }
    }

    // ── Stickers ─────────────────────────────────────────────────────
    if (stickers.size) {
      if (destination.premiumTier === 0) {
        skipped.push(`${stickers.size} sticker(s) (server has no boost slots)`);
      } else {
        let currentStickers = destination.stickers.cache.size;
        const cap = destination.stickerLimit || 24;
        for (const sticker of stickers.values()) {
          if (currentStickers >= cap) {
            skipped.push(`${sticker.name} (sticker slots full)`);
            continue;
          }
          try {
            const created = await destination.stickers.create({
              name: cleanName(sticker.name, 30),
              description: sticker.description || 'Copied via Peace✘ /clone all',
              tags: (sticker.tags || 'peacex').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30),
              file: sticker.url,
              reason: `Peace✘ /clone all from ${sourceGuild.name}`,
            });
            if (created) currentStickers += 1;
            copiedStickers += 1;
          } catch (err) {
            skipped.push(`${sticker.name} (${err.message})`);
          }
        }
      }
    }

    const embed = successEmbed({
      title: 'Clone Complete',
      description:
        `Copied from **${sourceGuild.name}** (\`${sourceGuild.id}\`) into **${destination.name}**.\n\n` +
        `Emojis copied: **${copiedEmojis}/${emojis.size}** · Stickers copied: **${copiedStickers}/${stickers.size}**`,
      fields: skipped.length
        ? [{ name: 'Skipped', value: skipped.slice(0, 15).map((s) => `• ${s}`).join('\n') + (skipped.length > 15 ? `\n…and ${skipped.length - 15} more` : '') }]
        : [],
      extra: `Run from ${interaction.guild?.name || 'DM'}`,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};