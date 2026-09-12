/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, set } = require('../../utils/settings');
const { setupStats, disableStats, updateStats } = require('../../utils/stats');
const { warningEmbed, successEmbed, infoEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Server statistics counter channels')
    .addSubcommand((s) => s.setName('setup').setDescription('Create member/bot counter channels')
      .addChannelOption((o) => o.setName('category').setDescription('Category to place the counters in').setRequired(true)))
    .addSubcommand((s) => s.setName('disable').setDescription('Delete counter channels and disable stats'))
    .addSubcommand((s) => s.setName('status').setDescription('Show current stats config'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const category = interaction.options.getChannel('category');
      if (category.type !== 4) {
        return reply(interaction, { embeds: [warningEmbed({ description: 'Please select a **category** channel.' })], ephemeral: true });
      }

      await interaction.deferReply();
      const channels = await setupStats(interaction.guild, category.id);
      await set(interaction.guild.id, 'stats', { enabled: true, ...channels });
      await updateStats(client, interaction.guild);

      await interaction.editReply({
        embeds: [
          successEmbed({
            title: 'Stats enabled',
            description:
              `Stats counters created in ${category.name}.\n` +
              `The channel names auto-update when members join or leave.`,
          }),
        ],
      });
    } else if (sub === 'disable') {
      await disableStats(client, interaction.guild);
      await set(interaction.guild.id, 'stats', { enabled: false, members: null, bots: null, category: null });
      await reply(interaction, { embeds: [successEmbed({ title: 'Stats disabled', description: 'Stats counters removed.' })], ephemeral: true });
    } else {
      const config = get(interaction.guild.id, 'stats');
      await reply(interaction, {
        embeds: [
          infoEmbed({
            title: 'Server stats',
            description:
              `**Enabled:** ${config.enabled ? 'Yes' : 'No'}\n` +
              `**Member counter:** ${config.members ? `<#${config.members}>` : '(none)'}\n` +
              `**Bot counter:** ${config.bots ? `<#${config.bots}>` : '(none)'}\n` +
              `**Members:** ${interaction.guild.memberCount}`,
          }),
        ],
      });
    }
  },
};