/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('removeroll')
    .setDescription('Remove all removable roles from a member (Owner only)')
    .addUserOption((o) => o.setName('member').setDescription('Member whose roles should be removed').setRequired(true)),
  async execute(interaction) {
    const guild = interaction.guild;
    const target = interaction.options.getMember('member');
    const me = guild.members.me;

    if (!target) return reply(interaction, { embeds: [errorEmbed({ description: 'Could not find that member.' })], ephemeral: true });
    if (target.id === guild.ownerId) return reply(interaction, { embeds: [errorEmbed({ description: 'Cannot remove roles from the server owner.' })], ephemeral: true });

    const removable = target.roles.cache
      .filter((role) => role.id !== guild.id && !role.managed && role.position < me.roles.highest.position);
    if (!removable.size) {
      return reply(interaction, { embeds: [errorEmbed({ description: `**${target.user.tag}** has no removable roles.` })], ephemeral: true });
    }

    try {
      await target.roles.remove([...removable.keys()], `Roles removed by ${interaction.user.tag}`);
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Roles removed', description: `Removed **${removable.size}** role${removable.size === 1 ? '' : 's'} from **${target.user.tag}**.` })],
      });
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
    }
  },
};