/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /addrole all mem <role> - add a role to EVERY member of the server
 * (Owner only). Runs sequentially so Discord's rate limits are respected,
 * with a live progress counter on the deferred reply.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed, loadingEmbed, commandEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('addrole')
    .setDescription('Add a role to all members (Owner only)')
    .addSubcommandGroup((g) =>
      g.setName('all').setDescription('Add a role to all server members')
        .addSubcommand((s) =>
          s.setName('mem').setDescription('Add a role to every member')
            .addRoleOption((o) => o.setName('role').setDescription('Role to add to everyone').setRequired(true))
        )
    ),
  async execute(interaction) {
    const role = interaction.options.getRole('role');
    const guild = interaction.guild;

    if (role.managed) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'That role is managed by an integration (e.g. a bot).' })], ephemeral: true });
    }
    if (role.position >= guild.members.me.roles.highest.position) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'My highest role is below that role — I cannot assign it.' })], ephemeral: true });
    }

    await interaction.deferReply();

    let members;
    try {
      members = await guild.members.fetch();
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed({ description: `Could not fetch members: ${err.message}` })] });
    }

    members = members.filter((m) => !m.user.bot && !m.roles.cache.has(role.id));
    if (!members.size) {
      return interaction.editReply({ embeds: [commandEmbed({ title: 'No Members', description: 'Every human member already has that role.' })] });
    }

    let done = 0;
    let failed = 0;
    const total = members.size;

    for (const member of members.values()) {
      try {
        await member.roles.add(role.id, 'addrole all mem');
        done += 1;
      } catch {
        failed += 1;
      }
      if ((done + failed) % 10 === 0 || done + failed === total) {
        await interaction.editReply({
          embeds: [
            loadingEmbed({
              title: 'Adding Role',
              description: `Added <@&${role.id}> to **${done}** of **${total}** members...`,
            }),
          ],
        }).catch(() => {});
      }
    }

    const embed = done > 0
      ? successEmbed({
          title: 'Role Added to Everyone',
          description: `Added <@&${role.id}> to **${done}** member${done === 1 ? '' : 's'}${failed ? ` · **${failed}** failed (hierarchy/rate limit)` : ''}.`,
        })
      : errorEmbed({
          title: 'Failed',
          description: `Could not add <@&${role.id}> to anyone.${failed ? ' Check role hierarchy.' : ''}`,
        });
    await interaction.editReply({ embeds: [embed] });
  },
};