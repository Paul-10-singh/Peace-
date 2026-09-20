/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /audit — global tamper-evident audit ledger (Layer 6).
 * Shows chain integrity + total footprint + latest anchoring across the whole
 * bot (not just the guild), and drops a verification snapshot into the ledger.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, warningEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Global security audit: ledger integrity + merkle anchoring')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((o) => o
      .setName('days')
      .setDescription('How far back to report (default: all)')
      .setMinValue(1)
      .setMaxValue(30)),
  async execute(interaction) {
    const sec = interaction.client.security;
    if (!sec?.ledger?.chain) {
      return interaction.reply({
        embeds: [errorEmbed({ title: 'Security Platform', description: 'Platform is not loaded — restart the bot.' })],
        flags: 64,
      });
    }

    const { chain, merkle } = sec.ledger;
    const integrity = chain.verify();
    const today = merkle.buildDailyRoot();

    const embed = successEmbed({
      title: 'Global Security Audit',
      description: 'Whole-bot tamper-evident ledger snapshot.',
      fields: [
        { name: 'Total entries', value: `${chain.count()}`, inline: true },
        { name: 'Integrity', value: integrity.ok ? '✅ intact' : `⚠️ broken (${integrity.gap?.flaw})`, inline: true },
        { name: 'Head hash', value: chain.lastEntry()?.hash ? `\`${chain.lastEntry().hash.slice(0, 24)}…\`` : '—', inline: true },
        { name: 'Merkle root (today)', value: today?.root ? `\`${today.root}\`` : 'not built', inline: false },
        { name: 'Signature', value: today?.signature ? `\`${today.signature.slice(0, 24)}…\`` : '—', inline: true },
        { name: 'Anchor', value: today ? `${today.entry_count} entries anchored · day ${today.day}` : '—', inline: true },
        { name: 'Verification', value: integrity.gap
          ? `Broken at entry \`${integrity.gap.seq}\` (${integrity.gap.flaw}) — chain modified or DB tampered.`
          : 'All links + hashes re-computed cleanly.', inline: false },
      ],
    });

    if (integrity.ok) {
      try {
        chain.append(interaction.guild.id, interaction.user.id, 'audit.check', null, { source: 'slash', verified: integrity.ok });
      } catch { /* non-fatal */ }
    }

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};