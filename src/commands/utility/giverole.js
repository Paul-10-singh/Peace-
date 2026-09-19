/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { sendLog } = require('../../utils/logging');
const { warningEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Assign or remove a role from a member')
    .addUserOption((o) => o.setName('user').setDescription('The member to modify').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('The role to assign or remove').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('action')
        .setDescription('What to do with the role')
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        )
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const action = interaction.options.getString('action') || 'add';
    const member = interaction.guild.members.cache.get(target.id);

    if (!member) return reply(interaction, { embeds: [warningEmbed({ description: 'That user is not in this server.' })], ephemeral: true });
    if (role.managed || role.id === interaction.guild.id) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'I cannot manage that role.' })], ephemeral: true });
    }
    if (action === 'add') {
      if (role.position >= interaction.member.roles.highest.position && interaction.member.id !== interaction.guild.ownerId) {
        return reply(interaction, { embeds: [warningEmbed({ description: 'You cannot assign a role higher than your highest role.' })], ephemeral: true });
      }
      if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return reply(interaction, { embeds: [warningEmbed({ description: 'My highest role is below that role, so I cannot assign it.' })], ephemeral: true });
      }
      if (member.roles.cache.has(role.id)) {
        return reply(interaction, { embeds: [warningEmbed({ description: 'That member already has this role.' })], ephemeral: true });
      }
      await member.roles.add(role.id, `Role given by ${interaction.user.tag}`);
      const text = `<a:correct:1550504846199758928> Gave <@&${role.id}> to ${target.tag}.`;
      await reply(interaction, { embeds: [successEmbed({ title: 'Role assigned', description: text })] });
      await sendLog(interaction.client, interaction.guild.id, 'role', { content: text });
    } else {
      if (!member.roles.cache.has(role.id)) {
        return reply(interaction, { embeds: [warningEmbed({ description: 'That member does not have this role.' })], ephemeral: true });
      }
      await member.roles.remove(role.id, `Role removed by ${interaction.user.tag}`);
      const text = `<a:correct:1550504846199758928> Removed <@&${role.id}> from ${target.tag}.`;
      await reply(interaction, { embeds: [successEmbed({ title: 'Role removed', description: text })] });
      await sendLog(interaction.client, interaction.guild.id, 'role', { content: text });
    }
  },
};