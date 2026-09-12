/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /rolemanage - role toolkit (Owner only). Subcommands:
 * info, all, strip, inrole.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed, commandEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('rolemanage')
    .setDescription('Role toolkit (Owner only)')
    .addSubcommand((s) => s.setName('info').setDescription('Show detailed info about a role')
      .addRoleOption((o) => o.setName('role').setDescription('Role to inspect').setRequired(true)))
    .addSubcommand((s) => s.setName('all').setDescription('Give a target role to everyone holding a source role')
      .addRoleOption((o) => o.setName('source').setDescription('Role members must already have').setRequired(true))
      .addRoleOption((o) => o.setName('target').setDescription('Role to add to those members').setRequired(true)))
    .addSubcommand((s) => s.setName('strip').setDescription('Strip every role from a member')
      .addUserOption((o) => o.setName('user').setDescription('Member to strip').setRequired(true))
      .addBooleanOption((o) => o.setName('include_bots').setDescription('Also remove bot-managed roles (default false)').setRequired(false)))
    .addSubcommand((s) => s.setName('inrole').setDescription('List all members holding a role')
      .addRoleOption((o) => o.setName('role').setDescription('Role to list members of').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'info') {
      const role = interaction.options.getRole('role');
      const members = await guild.members.fetch().catch(() => new Map());
      const count = members.size ? [...members.values()].filter((m) => m.roles.cache.has(role.id)).length : role.members.size;
      const bots = members.size ? [...members.values()].filter((m) => m.user.bot && m.roles.cache.has(role.id)).length : 0;

      const permissions = role.permissions.toArray();
      const notable = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'MentionEveryone', 'ManageMessages'];
      const highlighted = permissions.filter((p) => notable.includes(p));
      const keyPerms = highlighted.length ? highlighted.map((p) => `\`${p}\``).join(', ') : '*none*';

      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: `🛡️ ${role.name}`,
            description:
              `**ID:** \`${role.id}\`\n` +
              `**Color:** ${role.hexColor} · **Position:** ${role.position} (of ${guild.roles.highest.position})\n` +
              `**Mentionable:** ${role.mentionable ? 'Yes' : 'No'} · **Hoisted:** ${role.hoist ? 'Yes' : 'No'} · **Managed:** ${role.managed ? 'Yes' : 'No'}`,
            fields: [
              { name: 'Members', value: `**${count}** total${bots ? ` (${bots} bot${bots === 1 ? '' : 's'})` : ''}`, inline: true },
              { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:d>`, inline: true },
              { name: 'Key permissions', value: keyPerms },
            ],
          }),
        ],
      });
    }

    if (sub === 'all') {
      const source = interaction.options.getRole('source');
      const target = interaction.options.getRole('target');
      if (source.id === target.id) return reply(interaction, { embeds: [errorEmbed({ description: 'Source and target are the same role.' })], ephemeral: true });
      if (target.managed) return reply(interaction, { embeds: [errorEmbed({ description: 'The target role is managed by an integration.' })], ephemeral: true });
      if (target.position >= guild.members.me.roles.highest.position) {
        return reply(interaction, { embeds: [errorEmbed({ description: 'The target role is above my highest role — I cannot assign it.' })], ephemeral: true });
      }

      await interaction.deferReply();
      const members = await guild.members.fetch().catch(() => new Map());
      const eligible = [...members.values()].filter((m) => !m.user.bot && m.roles.cache.has(source.id) && !m.roles.cache.has(target.id));
      if (!eligible.length) {
        return interaction.editReply({ embeds: [errorEmbed({ description: `No members with <@&${source.id}> are missing <@&${target.id}>.` })] });
      }
      let done = 0;
      for (const member of eligible) {
        try {
          await member.roles.add(target.id, `rolemanage all by ${interaction.user.tag}`);
          done += 1;
        } catch {}
      }
      return interaction.editReply({
        embeds: [
          successEmbed({
            title: 'Role mass-assigned',
            description: `Added <@&${target.id}> to **${done}** of **${eligible.length}** members holding <@&${source.id}>.`,
          }),
        ],
      });
    }

    if (sub === 'strip') {
      const target = interaction.options.getMember('user');
      const includeBots = interaction.options.getBoolean('include_bots') || false;
      if (!target) return reply(interaction, { embeds: [errorEmbed({ description: 'Could not find that member.' })], ephemeral: true });
      if (target.id === guild.ownerId) return reply(interaction, { embeds: [errorEmbed({ description: 'Cannot strip the server owner.' })], ephemeral: true });

      const me = guild.members.me;
      const removable = target.roles.cache
        .filter((r) => r.id !== guild.id)
        .filter((r) => !r.managed || includeBots)
        .filter((r) => r.position < me.roles.highest.position);
      if (!removable.size) return reply(interaction, { embeds: [errorEmbed({ description: `**${target.user.tag}** has no removable roles.` })], ephemeral: true });

      try {
        await target.roles.remove([...removable.keys()], `Roles stripped by ${interaction.user.tag}`);
        return reply(interaction, {
          embeds: [successEmbed({ title: '🧹 Roles stripped', description: `Removed **${removable.size}** role${removable.size === 1 ? '' : 's'} from **${target.user.tag}**.` })],
        });
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
      }
    }

    if (sub === 'inrole') {
      const role = interaction.options.getRole('role');
      await interaction.deferReply();
      const members = await guild.members.fetch().catch(() => new Map());
      const holders = [...members.values()].filter((m) => m.roles.cache.has(role.id));
      if (!holders.length) return interaction.editReply({ embeds: [errorEmbed({ description: `No members hold <@&${role.id}>.` })] });

      const humans = holders.filter((m) => !m.user.bot);
      const lines = humans.map((m, i) => `${i + 1}. ${m.user.tag}`).slice(0, 30);
      const extra = humans.length > 30 ? `… and ${humans.length - 30} more` : '';
      return interaction.editReply({
        embeds: [
          commandEmbed({
            title: `👥 ${role.name}`,
            description: lines.join('\n') + (extra ? `\n${extra}` : ''),
            extra: `${humans.length} member${humans.length === 1 ? '' : 's'}${holders.length - humans.length ? ` · ${holders.length - humans.length} bot${holders.length - humans.length === 1 ? '' : 's'}` : ''}`,
          }),
        ],
      });
    }
  },
};