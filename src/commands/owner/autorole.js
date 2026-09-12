/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /autorole - automatically grant a role to every new member (Owner only).
 * Role id is stored persistently at data/settings.json ("autorole" key);
 * the actual assignment happens in src/events/guildMemberAdd.js.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { successEmbed, errorEmbed, commandEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Auto-assign a role to new members (Owner only)')
    .addSubcommand((s) => s.setName('add').setDescription('Set the role granted on join')
      .addRoleOption((o) => o.setName('role').setDescription('Role to assign to new members').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Disable autorole')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const role = interaction.options.getRole('role');
      set(interaction.guild.id, 'autorole', { roleId: role.id });
      await reply(interaction, {
        embeds: [successEmbed({ title: 'Autorole Enabled', description: `New members will now receive <@&${role.id}>.` })],
      });
      return;
    }

    set(interaction.guild.id, 'autorole', { roleId: null });
    await reply(interaction, {
      embeds: [commandEmbed({ title: 'Autorole Disabled', description: 'No role will be assigned on join anymore.' })],
    });
  },
  // Used by the join handler to read the configured role id.
  getRoleId: (guildId) => get(guildId, 'autorole').roleId || null,
};