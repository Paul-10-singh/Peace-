/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /antinuke - instant-action anti-nuke protection (concept from Peace✘ᴾᴿᴼ).
 *
 *   /antinuke on|off                      - arm / disarm the whole system
 *   /antinuke punishment <ban|kick|timeout>- set what happens to the executor
 *   /antinuke whitelist-role <role>       - add a role that bypasses protection
 *   /antinuke lockdown on|off             - also lock down channels on a hit
 *   /antinuke status                      - show the current configuration
 *
 * Once enabled, ANY single unauthorized destructive audit-log action
 * (ban/kick/channel/role/webhook/sticker/emoji/server change, bot add,
 * @everyone) instantly neutralizes the executor instead of waiting for a burst.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, warningEmbed, errorEmbed, infoEmbed } = require('../../utils/decorations');
const { get, set } = require('../../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Instant-action anti-nuke protection')
    .addSubcommand((s) => s.setName('on').setDescription('Enable instant anti-nuke protection'))
    .addSubcommand((s) => s.setName('off').setDescription('Disable anti-nuke protection'))
    .addSubcommand((s) =>
      s
        .setName('punishment')
        .setDescription('Set what happens to a nuke executor')
        .addStringOption((o) =>
          o.setName('action').setDescription('Punishment for the executor').setRequired(true)
            .addChoices(
              { name: 'Ban', value: 'ban' },
              { name: 'Kick', value: 'kick' },
              { name: 'Timeout (1h)', value: 'timeout' }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName('whitelist-role')
        .setDescription('Add/remove a role that bypasses anti-nuke')
        .addStringOption((o) => o.setName('mode').setDescription('add or remove').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
        .addRoleOption((o) => o.setName('role').setDescription('The role to exempt / un-exempt').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('lockdown')
        .setDescription('Toggle auto channel lockdown on a nuke hit')
        .addStringOption((o) => o.setName('mode').setDescription('on/off').setRequired(true).addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }))
    )
    .addSubcommand((s) => s.setName('status').setDescription('Show current anti-nuke configuration'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const cfg = get(guildId, 'security');

    if (sub === 'on') {
      cfg.antiNuke = cfg.antiNuke || {};
      cfg.antiNuke.enabled = true;
      set(guildId, 'security', cfg);
      return reply(interaction, {
        embeds: [successEmbed({
          title: '🛡️ Anti-Nuke ENABLED',
          description:
            'Instant-action anti-nuke is now **armed**.\n' +
            'Any unauthorized destructive action (ban/kick/channel/role/webhook/sticker/emoji/server change, bot add, @everyone) is punished immediately.',
        })],
      });
    }

    if (sub === 'off') {
      cfg.antiNuke = cfg.antiNuke || {};
      cfg.antiNuke.enabled = false;
      set(guildId, 'security', cfg);
      return reply(interaction, {
        embeds: [warningEmbed({ title: '🛡️ Anti-Nuke DISABLED', description: 'Instant-action anti-nuke protection is now OFF.' })],
      });
    }

    if (sub === 'punishment') {
      const action = interaction.options.getString('action');
      cfg.antiNuke = cfg.antiNuke || {};
      cfg.antiNuke.punishment = action;
      set(guildId, 'security', cfg);
      return reply(interaction, {
        embeds: [successEmbed({ description: `⚖️ Nuke executor punishment set to **${action.toUpperCase()}**.` })],
      });
    }

    if (sub === 'whitelist-role') {
      const mode = interaction.options.getString('mode');
      const role = interaction.options.getRole('role');
      if (mode === 'add') {
        cfg.antiNuke = cfg.antiNuke || {};
        if (!Array.isArray(cfg.antiNuke.whitelistRoles)) cfg.antiNuke.whitelistRoles = [];
        if (!cfg.antiNuke.whitelistRoles.includes(role.id)) cfg.antiNuke.whitelistRoles.push(role.id);
        set(guildId, 'security', cfg);
      } else {
        const cfg2 = get(guildId, 'security');
        cfg2.antiNuke = cfg2.antiNuke || {};
        cfg2.antiNuke.whitelistRoles = (cfg2.antiNuke.whitelistRoles || []).filter((id) => id !== role.id);
        set(guildId, 'security', cfg2);
      }
      return reply(interaction, {
        embeds: [successEmbed({ description: `${mode === 'add' ? '✅' : '🗑️'} Role <@&${role.id}> ${mode === 'add' ? 'now bypasses' : 'no longer bypasses'} anti-nuke.` })],
      });
    }

    if (sub === 'lockdown') {
      const mode = interaction.options.getString('mode');
      cfg.antiNuke = cfg.antiNuke || {};
      cfg.antiNuke.lockdown = mode === 'on';
      set(guildId, 'security', cfg);
      return reply(interaction, {
        embeds: [successEmbed({ description: `🔒 Auto-lockdown on nuke hit: **${mode.toUpperCase()}**.` })],
      });
    }

    // status
    const antiNuke = cfg.antiNuke || {};
    const fmt = (v) => (v ? '**[ON]**' : '**[OFF]**');
    return reply(interaction, {
      embeds: [infoEmbed({
        title: '🛡️ Anti-Nuke Status',
        description:
          `Status: ${fmt(antiNuke.enabled)}\n` +
          `Punishment: \`${(antiNuke.punishment || 'ban').toUpperCase()}\`\n` +
          `Auto-lockdown: ${fmt(antiNuke.lockdown !== false)}\n` +
          `Bypass roles: ${(antiNuke.whitelistRoles || []).length ? (antiNuke.whitelistRoles).map((id) => `<@&${id}>`).join(', ') : '*none*'}\n\n` +
          'Protected actions: ban, unban, kick, channel/role/webhook/sticker/emoji changes, server update, bot add, @everyone/@here.',
      })],
    });
  },
};