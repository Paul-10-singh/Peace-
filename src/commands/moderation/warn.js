/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { addWarn } = require('../../utils/settings');
const { warningEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption((o) => o.setName('user').setDescription('The user to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the warning'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = interaction.guild.members.cache.get(target.id);

    if (!member) return reply(interaction, { content: 'That user is not in this server.', ephemeral: true });

    const count = addWarn(interaction.guild.id, target.id);

    const embed = warningEmbed({
      title: 'Member Warned',
      description: `**${target.tag}** has been warned (warning **#${count}**).`,
      fields: [
        { name: 'User', value: target.tag, inline: true },
        { name: 'Warning Count', value: `#${count}`, inline: true },
        { name: 'Reason', value: reason },
      ],
      extra: `By ${interaction.user.tag}`,
    });

    await reply(interaction, { embeds: [embed] });

    try {
      await target.send(`You were warned in **${interaction.guild.name}**.\nReason: ${reason}\nTotal warnings: ${count}`);
    } catch {}
  },
};
