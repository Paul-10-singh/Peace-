/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /quarantine - jail system (Owner only). Subcommands:
 * jail, release, role (set jail role), bypass-add, bypass-remove, bypass-status.
 * Timed jails auto-release and restore the stripped roles.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply, formatDuration } = require('../../utils/helpers');
const { successEmbed, errorEmbed, commandEmbed } = require('../../utils/decorations');
const q = require('../../utils/quarantine');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('quarantine')
    .setDescription('Jail system: strip roles, assign jail role (Owner only)')
    .addSubcommand((s) => s.setName('jail').setDescription('Jail a member (strip roles + assign jail role)')
      .addUserOption((o) => o.setName('user').setDescription('Member to quarantine').setRequired(true))
      .addIntegerOption((o) => o.setName('duration').setDescription('Minutes (optional; auto-releases after this)').setRequired(false).setMinValue(1).setMaxValue(40320))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand((s) => s.setName('release').setDescription('Release a member and restore their roles')
      .addUserOption((o) => o.setName('user').setDescription('Member to release').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand((s) => s.setName('role').setDescription('Set the jail role applied to quarantined members')
      .addRoleOption((o) => o.setName('role').setDescription('Jail role (e.g. "Jailed")').setRequired(true)))
    .addSubcommand((s) => s.setName('bypass-add').setDescription('Exempt a role from quarantine')
      .addRoleOption((o) => o.setName('role').setDescription('Role to exempt').setRequired(true)))
    .addSubcommand((s) => s.setName('bypass-remove').setDescription('Remove a bypass role')
      .addRoleOption((o) => o.setName('role').setDescription('Role to no longer exempt').setRequired(true)))
    .addSubcommand((s) => s.setName('bypass-status').setDescription('Show the current quarantine config')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const config = q.getConfig(guild.id);

    if (sub === 'role') {
      const role = interaction.options.getRole('role');
      if (role.managed) return reply(interaction, { embeds: [errorEmbed({ description: 'That role is managed by an integration.' })], ephemeral: true });
      config.roleId = role.id;
      q.save(guild.id, config);
      return reply(interaction, { embeds: [successEmbed({ description: `Jail role set to <@&${role.id}>.` })] });
    }

    if (sub === 'bypass-add' || sub === 'bypass-remove') {
      const role = interaction.options.getRole('role');
      if (!Array.isArray(config.bypass)) config.bypass = [];
      const has = config.bypass.includes(role.id);
      if (sub === 'bypass-add' && has) return reply(interaction, { embeds: [errorEmbed({ description: `<@&${role.id}> is already bypassed.` })], ephemeral: true });
      if (sub === 'bypass-remove' && !has) return reply(interaction, { embeds: [errorEmbed({ description: `<@&${role.id}> is not bypassed.` })], ephemeral: true });
      if (sub === 'bypass-add') config.bypass.push(role.id);
      else config.bypass = config.bypass.filter((id) => id !== role.id);
      q.save(guild.id, config);
      return reply(interaction, { embeds: [successEmbed({ description: `<@&${role.id}> ${sub === 'bypass-add' ? 'added to' : 'removed from'} quarantine bypass.` })] });
    }

    if (sub === 'bypass-status') {
      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: '🔒 Quarantine config',
            description:
              `**Jail role:** ${config.roleId ? `<@&${config.roleId}>` : '*not set*'}\n` +
              `**Bypass roles:** ${config.bypass?.length ? config.bypass.map((id) => `<@&${id}>`).join(' ') : '*none*'}\n` +
              `**Currently jailed:** ${Object.keys(config.users || {}).length}`,
          }),
        ],
      });
    }

    if (sub === 'release') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'Quarantine lifted';
      if (!target) return reply(interaction, { embeds: [errorEmbed({ description: 'Could not find that member.' })], ephemeral: true });
      const entry = await q.releaseMember(guild, target.id, reason);
      if (!entry) return reply(interaction, { embeds: [errorEmbed({ description: `**${target.user.tag}** is not quarantined.` })], ephemeral: true });
      return reply(interaction, {
        embeds: [
          successEmbed({
            title: '🔓 Released',
            description: `**${target.user.tag}** was released from quarantine and their **${entry.roles.length}** role${entry.roles.length === 1 ? '' : 's'} were restored.\nReason: ${reason}`,
          }),
        ],
      });
    }

    if (sub === 'jail') {
      const target = interaction.options.getMember('user');
      const minutes = interaction.options.getInteger('duration');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (!target) return reply(interaction, { embeds: [errorEmbed({ description: 'Could not find that member.' })], ephemeral: true });
      if (target.id === interaction.user.id || target.id === guild.ownerId) {
        return reply(interaction, { embeds: [errorEmbed({ description: 'You cannot quarantine that member.' })], ephemeral: true });
      }
      if (target.user.bot) return reply(interaction, { embeds: [errorEmbed({ description: 'Bots cannot be quarantined.' })], ephemeral: true });
      if (!config.roleId) {
        return reply(interaction, { embeds: [errorEmbed({ description: 'No jail role is set. Use `/quarantine role <role>` to configure it first.' })], ephemeral: true });
      }
      if (q.isQuarantined(guild.id, target.id)) {
        return reply(interaction, { embeds: [errorEmbed({ description: `**${target.user.tag}** is already quarantined.` })], ephemeral: true });
      }
      if (q.isBypassed(guild.id, target)) {
        return reply(interaction, { embeds: [errorEmbed({ description: `**${target.user.tag}** holds a quarantine-bypass role.` })], ephemeral: true });
      }

      const jailRole = guild.roles.cache.get(config.roleId);
      if (!jailRole) {
        return reply(interaction, { embeds: [errorEmbed({ description: 'The configured jail role no longer exists. Re-set it with `/quarantine role <role>`.' })], ephemeral: true });
      }
      const me = guild.members.me;
      if (jailRole.position >= me.roles.highest.position) {
        return reply(interaction, { embeds: [errorEmbed({ description: 'The jail role is above my highest role — I cannot assign it.' })], ephemeral: true });
      }

      const removed = [];
      for (const role of target.roles.cache.values()) {
        if (role.managed || role.id === guild.id) continue;
        if (role.position >= me.roles.highest.position) continue;
        if (role.id === jailRole.id) continue;
        removed.push(role.id);
      }

      const until = minutes ? Date.now() + minutes * 60000 : null;
      q.quarantine(guild.id, target.id, jailRole.id, removed, interaction.user.tag, until);

      try {
        if (removed.length) await target.roles.remove(removed, `Quarantined by ${interaction.user.tag}: ${reason}`);
        await target.roles.add(jailRole.id, `Quarantined by ${interaction.user.tag}: ${reason}`);
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Could not apply roles: ${err.message}` })], ephemeral: true });
      }

      if (until) {
        const ms = until - Date.now();
        setTimeout(() => {
          q.releaseMember(guild, target.id, 'Quarantine timer expired').catch(() => {});
        }, ms);
      }

      return reply(interaction, {
        embeds: [
          successEmbed({
            title: '🔒 Quarantined',
            description: `**${target.user.tag}** is jailed in <@&${jailRole.id}> (removed **${removed.length}** role${removed.length === 1 ? '' : 's'}).\nReason: ${reason}`,
            fields: until ? [{ name: 'Auto-release', value: `in ${formatDuration(until - Date.now())}`, inline: true }] : undefined,
          }),
        ],
      });
    }
  },
};