/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /vcstatus - permanent voice channel status management.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { get, set } = require('../../utils/settings');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('vcstatus')
    .setDescription('Permanent voice channel status management')
    .addSubcommand((s) => s.setName('set').setDescription('Set permanent voice channel status')
      .addChannelOption((o) => o.setName('channel').setDescription('Voice Channel').setRequired(true))
      .addStringOption((o) => o.setName('status').setDescription('Status text (type "clear" to remove)').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const targetChannel = interaction.options.getChannel('channel');
      if (targetChannel.type !== 2) {
        return reply(interaction, { embeds: [errorEmbed({ description: 'Please select a Voice Channel.' })], ephemeral: true });
      }
      const statusArg = interaction.options.getString('status');
      const statusText = statusArg.toLowerCase() === 'clear' ? null : statusArg;
      
      const config = get(interaction.guild.id, 'vcstatus') || {};
      
      if (statusText) {
        config[targetChannel.id] = statusText;
      } else {
        delete config[targetChannel.id];
      }
      set(interaction.guild.id, 'vcstatus', config);
      
      try {
        await interaction.client.rest.put(`/channels/${targetChannel.id}/voice-status`, { body: { status: statusText } });
        return reply(interaction, {
          embeds: [successEmbed({ 
            title: 'VC Status Saved', 
            description: statusText ? `Status for <#${targetChannel.id}> set to **${statusText}** and will auto-reapply when users join.` : `Permanent status for <#${targetChannel.id}> cleared.` 
          })],
        });
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
      }
    }
  },
};
