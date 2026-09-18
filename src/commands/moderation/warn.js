/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /warn - one command for every warning task:
 *   /warn add <user> [reason]   - warn a member
 *   /warn list [user]           - show a member's warnings
 *   /warn remove <user>         - remove all warnings from a member
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { get, addWarn, clearWarns } = require('../../utils/settings');
const { warningEmbed, successEmbed, infoEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn, check, or clear member warnings')
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Warn a member')
        .addUserOption((o) => o.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the warning')))
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('Show a member\'s warnings (defaults to you)')
        .addUserOption((o) => o.setName('user').setDescription('The user to check')))
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove all warnings from a member')
        .addUserOption((o) => o.setName('user').setDescription('The user to unwarn').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /warn add <user> [reason] ───────────────────────────────────
    if (sub === 'add') {
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
      return;
    }

    // ── /warn list [user] ───────────────────────────────────────────
    if (sub === 'list') {
      const user = interaction.options.getUser('user') || interaction.user;
      const config = get(interaction.guild.id, 'security');
      const count = config.warns?.[user.id] || 0;

      const build = () =>
        warningEmbed({
          title: 'Warnings',
          description: `**${user.tag}** has **${count}** warning(s).`,
          fields: [{ name: 'Warning Count', value: `#${count}`, inline: true }],
          extra: `Checked by ${interaction.user.tag}`,
        });

      // Zero warnings shows green, otherwise yellow (matches old /warnings behaviour)
      const embed = count > 0 ? build() : successEmbed({
        title: 'Warnings',
        description: `**${user.tag}** has **${count}** warning(s).`,
        fields: [{ name: 'Warning Count', value: `#${count}`, inline: true }],
        extra: `Checked by ${interaction.user.tag}`,
      });

      await reply(interaction, { embeds: [embed] });
      return;
    }

    // ── /warn remove <user> ─────────────────────────────────────────
    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      const before = get(interaction.guild.id, 'security').warns?.[target.id] || 0;
      clearWarns(interaction.guild.id, target.id);

      const embed = before > 0
        ? successEmbed({
            title: 'Warnings Cleared',
            description: `Cleared **${before}** warning(s) from ${target.tag}.`,
            extra: `By ${interaction.user.tag}`,
          })
        : infoEmbed({
            title: 'No Warnings',
            description: `${target.tag} had no warnings.`,
            extra: `By ${interaction.user.tag}`,
          });

      await reply(interaction, { embeds: [embed] });
    }
  },
};