/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply, chunkFieldValue } = require('../../utils/helpers');
const { successEmbed, warningEmbed, infoEmbed } = require('../../utils/decorations');
const { get, set } = require('../../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antilink')
    .setDescription('Configure link protection (block links + scam links)')
    .addSubcommand((s) => s.setName('on').setDescription('Block all links except allowed domains'))
    .addSubcommand((s) => s.setName('off').setDescription('Stop blocking links (scam links stay blocked)'))
    .addSubcommand((s) => s.setName('allow').setDescription('Add a domain to the allow-list')
      .addStringOption((o) => o.setName('domain').setDescription('Domain to allow, e.g. youtube.com').setRequired(true)))
    .addSubcommand((s) => s.setName('disallow').setDescription('Remove a domain from the allow-list')
      .addStringOption((o) => o.setName('domain').setDescription('The domain to remove').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show allowed domains and status'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = get(interaction.guild.id, 'security');

    if (sub === 'on') {
      config.antiLink.enabled = true;
      set(interaction.guild.id, 'security', config);
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Anti-Link Enabled', description: 'All links are now blocked, except allow-listed domains.' })],
      });
    }

    if (sub === 'off') {
      config.antiLink.enabled = false;
      set(interaction.guild.id, 'security', config);
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Anti-Link Disabled', description: 'Link blocking is disabled. Scam links are still blocked automatically.' })],
      });
    }

    if (sub === 'allow' || sub === 'disallow') {
      let domain = interaction.options.getString('domain').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!domain) return reply(interaction, { content: 'Invalid domain.', ephemeral: true });
      if (sub === 'allow') {
        const allow = config.antiLink.allow || [];
        if (!allow.includes(domain)) {
          config.antiLink.allow = [...allow, domain];
          set(interaction.guild.id, 'security', config);
        }
        return reply(interaction, {
          embeds: [successEmbed({ title: 'Domain Allowed', description: `\`${domain}\` is now allow-listed.` })],
        });
      } else {
        config.antiLink.allow = (config.antiLink.allow || []).filter((d) => d !== domain);
        set(interaction.guild.id, 'security', config);
        return reply(interaction, {
          embeds: [successEmbed({ title: 'Domain Removed', description: `\`${domain}\` removed from the allow-list.` })],
        });
      }
    }

    // list
    const allow = config.antiLink.allow || [];
    const domainLines = allow.length ? allow.map((d) => `\`${d}\``) : ['(none)'];
    const fields = [
      { name: 'Status', value: config.antiLink.enabled ? 'ON' : 'OFF', inline: true },
      { name: 'Scam-link blocking', value: config.antiLink.blockScam !== false ? 'ON' : 'OFF', inline: true },
      ...chunkFieldValue(domainLines).map((value, i) => ({
        name: i === 0 ? 'Allowed domains' : 'Allowed domains (cont.)',
        value,
      })),
    ];
    await reply(interaction, {
      embeds: [infoEmbed({ title: 'Anti-Link Overview', fields })],
    });
  },
};
