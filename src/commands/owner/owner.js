/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, successEmbed, warningEmbed } = require('../../utils/decorations');
const { isOwner, mainOwnerId, getOwners, addOwner, removeOwner, addTempOwner, getTempOwner } = require('../../utils/owners');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('extraowner')
    .setDescription('Manage bot owners (extra owners get the same powers)')
    .addSubcommand((s) => s.setName('add').setDescription('Grant bot owner powers to a user (main owner only)')
      .addUserOption((o) => o.setName('user').setDescription('The user to promote').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Revoke bot owner powers (main owner only)')
      .addUserOption((o) => o.setName('user').setDescription('The user to demote').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show all bot owners'))
    .addSubcommand((s) => s.setName('temp').setDescription('Grant owner powers for a limited time (main owner only)')
      .addUserOption((o) => o.setName('user').setDescription('User to grant').setRequired(true))
      .addIntegerOption((o) => o.setName('minutes').setDescription('Duration in minutes (max 10080)').setRequired(true).setMinValue(1).setMaxValue(10080))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild?.id;

    // Only the main owner (OWNER_ID in .env) may change the owner list
    const isMain = mainOwnerId() === interaction.user.id;
    if (sub !== 'list' && !isMain) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Permission Denied', description: 'Only the **main bot owner** can modify the owner list.' })],
        ephemeral: true,
      });
    }

    if (sub === 'list') {
      const owners = getOwners(guildId);
      return reply(interaction, {
        embeds: [
          commandEmbed({
            title: '🤖 Bot owners',
            description: owners.length
              ? owners.map((id, i) => `${i === 0 ? '👑' : '⭐'} <@${id}> ${id === mainOwnerId() ? '*(main owner)*' : ''}${getTempOwner(id, guildId) ? ` *(temp, expires <t:${Math.floor(getTempOwner(id, guildId) / 1000)}:R>)*` : ''}`).join('\n')
              : 'No owners configured. Set OWNER_ID in .env.',
          }),
        ],
      });
    }

    const target = interaction.options.getUser('user');

    if (sub === 'temp') {
      if (isOwner(target.id, guildId)) {
        return reply(interaction, {
          embeds: [warningEmbed({ title: 'Already an Owner', description: `${target.tag} is already a bot owner.` })],
          ephemeral: true,
        });
      }
      const minutes = interaction.options.getInteger('minutes');
      const until = addTempOwner(target.id, Date.now() + minutes * 60000, guildId);
      return reply(interaction, {
        embeds: [
          successEmbed({
            title: '⏳ Temp owner granted',
            description: `**${target.tag}** now has owner powers until <t:${Math.floor(until / 1000)}:f> (<t:${Math.floor(until / 1000)}:R>).`,
          }),
        ],
      });
    }

    if (sub === 'add') {
      if (isOwner(target.id, guildId)) {
        return reply(interaction, {
          embeds: [warningEmbed({ title: 'Already an Owner', description: `${target.tag} is already a bot owner.` })],
          ephemeral: true,
        });
      }
      addOwner(target.id, guildId);
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Owner Added', description: `⭐ **${target.tag}** is now a bot owner with full owner powers.` })],
      });
    }

    if (target.id === mainOwnerId()) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Protected', description: 'You cannot remove the main owner.' })],
        ephemeral: true,
      });
    }
    if (!isOwner(target.id, guildId)) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Not an Owner', description: `${target.tag} is not a bot owner.` })],
        ephemeral: true,
      });
    }
    removeOwner(target.id, guildId);
    return reply(interaction, {
      embeds: [successEmbed({ title: 'Owner Removed', description: `${target.tag} is no longer a bot owner.` })],
    });
  },
};
