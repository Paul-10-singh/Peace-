/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed, loadingEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('removerollall')
    .setDescription('Remove a role from every member (Owner only)')
    .addRoleOption((o) => o.setName('role').setDescription('Role to remove from everyone').setRequired(true)),
  async execute(interaction) {
    const guild = interaction.guild;
    const role = interaction.options.getRole('role');
    const me = guild.members.me;

    if (role.managed) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'That role is managed by an integration and cannot be removed.' })], ephemeral: true });
    }
    if (role.position >= me.roles.highest.position) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'My highest role is below that role — I cannot remove it.' })], ephemeral: true });
    }

    await interaction.deferReply();
    let members;
    try {
      members = await guild.members.fetch();
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed({ description: `Could not fetch members: ${err.message}` })] });
    }

    const eligible = [...members.values()].filter((member) => member.roles.cache.has(role.id));
    if (!eligible.length) return interaction.editReply({ embeds: [errorEmbed({ description: `No members have <@&${role.id}>.` })] });

    let done = 0;
    let failed = 0;
    for (const member of eligible) {
      try {
        await member.roles.remove(role.id, `Role removed from all by ${interaction.user.tag}`);
        done += 1;
      } catch {
        failed += 1;
      }
      if ((done + failed) % 10 === 0 || done + failed === eligible.length) {
        await interaction.editReply({
          embeds: [loadingEmbed({ title: 'Removing role', description: `Removed <@&${role.id}> from **${done}** of **${eligible.length}** members...` })],
        }).catch(() => {});
      }
    }

    return interaction.editReply({
      embeds: [successEmbed({ title: 'Role removed from everyone', description: `Removed <@&${role.id}> from **${done}** of **${eligible.length}** members${failed ? ` · **${failed}** failed` : ''}.` })],
    });
  },
};