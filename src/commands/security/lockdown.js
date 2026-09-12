/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, warningEmbed } = require('../../utils/decorations');
const { sendLog } = require('../../utils/logging');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock every text channel in the server (or lift the lockdown)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const alreadyLocked = interaction.client.lockdownActive;

    if (alreadyLocked) {
      for (const channel of interaction.guild.channels.cache.values()) {
        if (channel.isTextBased() && channel.permissionOverwrites.cache.has(interaction.guild.id)) {
          await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null }).catch(() => {});
        }
      }
      interaction.client.lockdownActive = false;
      await sendLog(interaction.client, interaction.guild.id, 'security', {
        embeds: [successEmbed({
          title: 'Lockdown Lifted',
          description: `The server lockdown was lifted by ${interaction.user.tag}.`,
        })],
      });
      return reply(interaction, {
        embeds: [successEmbed({
          title: 'Lockdown Lifted',
          description: 'All channels are unlocked.',
        })],
      });
    }

    for (const channel of interaction.guild.channels.cache.values()) {
      if (channel.isTextBased()) {
        await channel.permissionOverwrites
          .edit(interaction.guild.id, { SendMessages: false }, { reason: `Lockdown triggered by ${interaction.user.tag}` })
          .catch(() => {});
      }
    }
    interaction.client.lockdownActive = true;
    await sendLog(interaction.client, interaction.guild.id, 'security', {
      embeds: [warningEmbed({
        title: 'Lockdown Active',
        description: `The server was locked down by ${interaction.user.tag}.`,
      })],
    });
    await reply(interaction, {
      embeds: [warningEmbed({
        title: 'Lockdown Active',
        description: 'All text channels are now locked. Run `/lockdown` again to lift it.',
      })],
    });
  },
};
