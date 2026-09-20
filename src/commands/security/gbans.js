/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /gbans — cross-guild federation (Layer 8).
 *   /gbans check <userId>   — reputation + how many independent guilds have
 *                             reported this user (≥N = federated ban)
 *   /gbans appeal <userId>  — file an appeal (tamper-evident via ledger)
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, warningEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gbans')
    .setDescription('Federated ban check — cross-guild reputation (Layer 8)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) => s
      .setName('check')
      .setDescription('Check a user against the federation')
      .addUserOption((o) => o
        .setName('user')
        .setDescription('Target user')
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('appeal')
      .setDescription('File an appeal for a user')
      .addUserOption((o) => o
        .setName('user')
        .setDescription('User appealing')
        .setRequired(true))
      .addStringOption((o) => o
        .setName('evidence')
        .setDescription('Reason / evidence link')
        .setRequired(false))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const sec = interaction.client.security;
    if (!sec?.nexus?.check) {
      return interaction.reply({
        embeds: [errorEmbed({ title: 'Federation', description: 'Nexus is not configured (NEXUS_RELAY_URL).' })],
        flags: 64,
      });
    }
    if (sub === 'check') return check(interaction, sec);
    return appeal(interaction, sec);
  },
};

async function check(interaction, sec) {
  const user = interaction.options.getUser('user');
  const info = sec.nexus.check(user.id);

  const rep = Math.min(1, Math.max(0, info.reputation));
  const bar = '▰'.repeat(Math.round(rep * 10)) + '▱'.repeat(10 - Math.round(rep * 10));
  const banned = info.ban;

  const embed = successEmbed({
    title: `Federated Check — ${user.username}`,
    description: banned
      ? '🚫 **Federated ban active** — reported by independent guilds.'
      : '✅ No federated ban threshold reached.',
    fields: [
      { name: 'Reports', value: `${info.reports}`, inline: true },
      { name: 'Guilds', value: `${info.guilds}/${info.threshold}`, inline: true },
      { name: 'Reputation', value: `${bar} ${(rep * 100).toFixed(0)}%`, inline: true },
    ],
    extra: info.firstReportedAt
      ? `First reported ${new Date(info.firstReportedAt).toLocaleString()}`
      : 'No reports on record.',
  });

  await interaction.reply({ embeds: [embed], flags: 64 });
}

async function appeal(interaction, sec) {
  const user = interaction.options.getUser('user');
  const evidence = interaction.options.getString('evidence') || 'Admin review requested';

  const res = sec.nexus.appeal({
    userId: user.id,
    appellant: interaction.user.id,
    evidence,
    guildId: interaction.guild.id,
  });
  if (res?.ok) {
    await interaction.reply({
      embeds: [successEmbed({
        title: 'Appeal Filed',
        description: `Case **${res.caseId}** for <@${user.id}> opened. Evidence recorded in the tamper-evident ledger.`,
      })],
      flags: 64,
    });
  } else {
    await interaction.reply({
      embeds: [errorEmbed({ title: 'Appeal', description: 'Appeal could not be recorded.' })],
      flags: 64,
    });
  }
}