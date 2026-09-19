/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /vcrole - restrict /vc task, /vc custom_stats and /vc chart to members
 * holding a configured role (Owner only). /vc stats stays open to everyone.
 * Role id is stored persistently at data/settings.json ("vcrole" key).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { successEmbed, commandEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('vcrole')
    .setDescription('Restrict VC task/chart commands to a role (Owner only)')
    .addSubcommand((s) => s.setName('set').setDescription('Set the role that can use /vc task, /vc custom_stats and /vc chart')
      .addRoleOption((o) => o.setName('role').setDescription('Role that gains access to the locked VC commands').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove the role restriction (re-locks all three commands)'))
    .addSubcommand((s) => s.setName('status').setDescription('Show the current VC role restriction')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const role = interaction.options.getRole('role');
      set(interaction.guild.id, 'vcrole', { roleId: role.id });
      await reply(interaction, {
        embeds: [successEmbed({
          title: 'VC Role Restriction Enabled',
          description: `Only members with <@&${role.id}> can now use **/vc task**, **/vc custom_stats** and **/vc chart**. **/vc stats** stays open to everyone.`,
        })],
      });
      return;
    }

    if (sub === 'remove') {
      set(interaction.guild.id, 'vcrole', { roleId: null });
      await reply(interaction, {
        embeds: [commandEmbed({
          title: 'VC Role Restriction Removed',
          description: 'The three VC commands are now owner-only until a new role is set with `/vcrole set`.',
        })],
      });
      return;
    }

    const roleId = get(interaction.guild.id, 'vcrole').roleId;
    const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;
    await reply(interaction, {
      embeds: [commandEmbed({
        title: 'VC Role Restriction',
        description: role
          ? `**/vc task**, **/vc custom_stats** and **/vc chart** now require **<@&${role.id}>**.\n**/vc stats** is open to everyone.`
          : `No role is configured yet.\n**/vc task**, **/vc custom_stats** and **/vc chart** are **owner-only**.\n**/vc stats** is open to everyone.\nUse \`/vcrole set role:<role>\` to enable access.`,
      })],
    });
  },
  // Used by the permission system to read the configured role id.
  getRoleId: (guildId) => get(guildId, 'vcrole').roleId || null,
};