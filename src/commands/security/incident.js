/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /incident — Layer 7 incident playbook controls.
 *   /incident list             — recent incidents in this guild
 *   /incident rollback <id>    — un-do a playbook (restore roles/permissions,
 *                                delete the incident channel, close the case)
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, warningEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('incident')
    .setDescription('Incident response — list or roll back security playbooks')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s
      .setName('list')
      .setDescription('Recent incidents in this guild'))
    .addSubcommand((s) => s
      .setName('rollback')
      .setDescription('Roll back a resolved/failed incident')
      .addStringOption((o) => o
        .setName('id')
        .setDescription('Incident ID (e.g. nuke-abc123)')
        .setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') return list(interaction);
    return rollback(interaction);
  },
};

async function list(interaction) {
  const sec = interaction.client.security;
  if (!sec?.playbooks) {
    return interaction.reply({
      embeds: [errorEmbed({ title: 'Incidents', description: 'Playbook runner not loaded.' })],
      flags: 64,
    });
  }

  const incidents = sec.playbooks.listIncidents(interaction.guild.id, 10);
  if (!incidents.length) {
    return interaction.reply({
      embeds: [successEmbed({ title: 'Incidents', description: 'No incidents recorded in this guild yet.' })],
      flags: 64,
    });
  }

  const lines = incidents.map((inc) => {
    const ts = new Date(inc.created_at).toLocaleString();
    return `\`${inc.id}\` · **${inc.type}** · ${inc.state} · ${ts}`;
  });

  await interaction.reply({
    embeds: [successEmbed({
      title: 'Recent Incidents',
      description: lines.join('\n'),
      extra: 'Use /incident rollback <id> to undo a playbook.',
    })],
    flags: 64,
  });
}

async function rollback(interaction) {
  const sec = interaction.client.security;
  const id = interaction.options.getString('id').trim();
  if (!sec?.playbooks) {
    return interaction.reply({
      embeds: [errorEmbed({ title: 'Rollback', description: 'Playbook runner not loaded.' })],
      flags: 64,
    });
  }

  const inc = sec.playbooks.getIncident(id);
  if (!inc || inc.guild_id !== interaction.guild.id) {
    return interaction.reply({
      embeds: [warningEmbed({ title: 'Rollback', description: `No incident \`${id}\` in this guild.` })],
      flags: 64,
    });
  }

  await interaction.deferReply({ ephemeral: true });
  const res = await sec.playbooks.rollback(interaction.client, id);
  if (!res.ok) {
    return interaction.editReply({
      embeds: [errorEmbed({ title: 'Rollback', description: `Could not roll back \`${id}\`: ${res.reason}` })],
    });
  }
  await interaction.editReply({
    embeds: [successEmbed({
      title: 'Rollback Complete',
      description: res.restored?.map((r) => `• ${r}`).join('\n') || 'Done.',
    })],
  });
}