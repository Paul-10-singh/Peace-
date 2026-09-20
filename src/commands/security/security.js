/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /security - master dashboard for every automatic security feature,
 * backed by the 2026 ten-layer platform (src/security).
 *
 *   /security panel   - interactive control panel (anti-link/anti-nuke/
 *                       anti-spam/anti-words/anti-bot/anti-raid/scam-detect)
 *   /security audit   - tamper-evident ledger integrity + recent entries
 *   /security verify  - un-soft-lock a flagged user (UEBA) or inspect an
 *                       incident (Layer 2 / Layer 7)
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { openPanel } = require('../../utils/securityPanel');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Master security dashboard — switch everything and tune each protection')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s
      .setName('panel')
      .setDescription('Open the interactive security control panel'))
    .addSubcommand((s) => s
      .setName('audit')
      .setDescription('Show tamper-evident ledger integrity and recent security events'))
    .addSubcommand((s) => s
      .setName('verify')
      .setDescription('Re-verify a soft-locked user (UEBA) or inspect an incident')
      .addStringOption((o) => o
        .setName('id')
        .setDescription('User ID to un-soft-lock, or an incident ID such as nuke-abc123')
        .setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') return openPanel(interaction, 'security');
    if (sub === 'audit') return audit(interaction);
    return verify(interaction);
  },
};

async function audit(interaction) {
  const guildId = interaction.guild.id;
  const sec = interaction.client.security;

  if (!sec?.ledger?.chain) {
    return interaction.reply({
      embeds: [errorEmbed({ title: 'Security Platform', description: 'Platform is not loaded — restart the bot.' })],
      flags: 64,
    });
  }

  const { chain, merkle } = sec.ledger;
  const integrity = chain.verify(guildId);
  const entries = chain.query({ guildId, limit: 8 });
  const latest = chain.lastEntry();
  const morning = merkle.dayKey(Date.now());
  const root = merkle.buildDailyRoot() || {};

  const recent = entries.length
    ? entries.map((e) => `\`${e.seq}\` ${e.action} → ${e.actor || 'system'}`).join('\n')
    : 'No entries yet.';

  const embed = successEmbed({
    title: 'Security Audit',
    description: 'Hash-chained ledger integrity check for this guild.',
    fields: [
      { name: 'Ledger', value: `${entries.length} recent · ${chain.count()} total`, inline: true },
      { name: 'Integrity', value: integrity.ok ? '✅ intact' : `⚠️ broken (${integrity.gap?.flaw})`, inline: true },
      { name: 'Merkle (today)', value: root.root ? `\`${root.root}\`` : 'not built yet', inline: false },
      { name: 'Head hash', value: latest?.hash ? `\`${latest.hash.slice(0, 24)}…\`` : '—', inline: true },
      { name: 'Day key', value: `${morning}`, inline: true },
      { name: 'Recent events', value: recent.slice(0, 900), inline: false },
    ],
  });

  await interaction.reply({ embeds: [embed], flags: 64 });
}

async function verify(interaction) {
  const id = interaction.options.getString('id').trim();
  const sec = interaction.client.security;
  const guildId = interaction.guild.id;

  const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle('Security Verify').setFooter({ text: 'Peace✘ Security' });
  if (sec?.behavior?.anomalies?.isLocked?.(guildId, id)) {
    sec.behavior.anomalies.verify(`${guildId}:${id}`);
    if (sec.ledger?.chain) {
      try {
        sec.ledger.chain.append(guildId, interaction.user.id, 'ueba.verify', id, { source: 'slash' });
      } catch { /* non-fatal */ }
    }
    embed
      .setColor(0x57f287)
      .setDescription(`<@${id}> was **verified human** — soft-lock cleared and behavior baseline continues.`);
  } else if (sec?.playbooks) {
    const inc = sec.playbooks.getIncident(id);
    if (inc && inc.guild_id === guildId) {
      const steps = sec.playbooks.execute
        ? 'see incident channel / use /incident rollback for cleanup'
        : '—';
      embed
        .setColor(0x57f287)
        .setDescription(`Incident **\`${id}\`** — \`${inc.type}\` · state **${inc.state}**\nSteps: ${steps}`);
    } else {
      embed
        .setColor(0xed4245)
        .setDescription(`Nothing flagged for \`${id}\` — user is not soft-locked and no matching incident exists in this guild.`);
    }
  } else {
    embed.setDescription('Security platform unavailable — restart the bot.');
  }
  await interaction.reply({ embeds: [embed], flags: 64 });
}