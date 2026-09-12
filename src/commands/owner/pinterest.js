/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /pinterest - unofficial Pinterest image search (no official API exists;
 * this scrapes the public search page — unstable by nature).
 * banner/pfp return style-filtered images; search returns a batch;
 * pin returns info for a specific pin URL.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, infoEmbed, errorEmbed } = require('../../utils/decorations');
const { searchPins, stylePins } = require('../../utils/pinterest');

// Fetch one image and re-post it as a file (avoids CDN hotlink issues in embeds).
async function toAttachment(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error('Could not download the image from Pinterest.');
  const buf = Buffer.from(await res.arrayBuffer());
  return { attachment: buf, name: 'pinterest.png' };
}

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('pinterest')
    .setDescription('Unofficial Pinterest image search (Owner only)')
    .addSubcommand((s) =>
      s.setName('banner').setDescription('Fetch a banner-style image')
        .addStringOption((o) => o.setName('style').setDescription('What should the banner be about?').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('pfp').setDescription('Fetch a profile-picture-style image')
        .addStringOption((o) => o.setName('style').setDescription('What should the pfp be about?').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('search').setDescription('Search Pinterest for images')
        .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('pin').setDescription('Get image from a pin URL')
        .addStringOption((o) => o.setName('url').setDescription('A Pinterest pin URL').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    try {
      if (sub === 'banner' || sub === 'pfp') {
        const style = interaction.options.getString('style');
        const pins = await stylePins(style, sub, 1);
        const pin = pins[0];
        const file = await toAttachment(pin.image);
        return interaction.editReply({
          embeds: [commandEmbed({
            title: sub === 'banner' ? 'Pinterest Banner' : 'Pinterest PFP',
            description: `Style: **${style}**`,
            extra: 'Unofficial Pinterest scrape',
          })],
          files: [file],
        });
      }

      if (sub === 'search') {
        const query = interaction.options.getString('query');
        const pins = await searchPins(query, 5);
        if (!pins.length) return interaction.editReply({ embeds: [errorEmbed({ description: 'No pins found (Pinterest may have changed their page — try again).' })] });
        const rows = pins.map((p, i) => `**${i + 1}.** [Image ${i + 1}](${p.image})`);
        return interaction.editReply({
          embeds: [commandEmbed({
            title: 'Pinterest Search',
            description: `Results for **${query}**:\n${rows.join('\n')}`,
            extra: 'Unofficial — links may expire',
          })],
        });
      }

      // pin
      const url = interaction.options.getString('url');
      if (!/^https?:\/\/[a-z.]*pinterest\.[a-z]+\/(pin|pins)\//i.test(url)) {
        return interaction.editReply({ embeds: [errorEmbed({ description: 'That is not a Pinterest pin URL (e.g. https://www.pinterest.com/pin/123456789/).' })] });
      }
      const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
      const og = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (!og) return interaction.editReply({ embeds: [errorEmbed({ description: 'Could not read that pin (Pinterest may have blocked it).' })] });
      const file = await toAttachment(og[1]);
      return interaction.editReply({
        embeds: [infoEmbed({ title: 'Pinterest Pin', description: `[Open original](${url})` })],
        files: [file],
      });
    } catch (err) {
      console.error('[PeaceX] [Pinterest] error:', err);
      return interaction.editReply({ embeds: [errorEmbed({ description: `Pinterest scrape failed: ${err.message}` })] }).catch(() => {});
    }
  },
};