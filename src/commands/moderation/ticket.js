/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { isOwner } = require('../../utils/owners');
const { setStaffRole, setLogChannel } = require('../../utils/tickets');
const { buildPanelContent, closeTicketFlow } = require('./ticketpanel');
const { successEmbed, infoEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Setup and manage the ticket support system')
    .addSubcommand((s) =>
      s.setName('setup').setDescription('Set the staff role that can manage all tickets')
        .addRoleOption((o) => o.setName('role').setDescription('The staff role').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('setlog').setDescription('Set the transcript log channel')
        .addChannelOption((o) => o.setName('channel').setDescription('The log channel').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('panel').setDescription('Post the ticket panel embed in a channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to post the panel in').setRequired(true)))
    .addSubcommand((s) => s.setName('close').setDescription('Close the current ticket and save a transcript')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'close') {
      return closeTicketFlow(interaction, interaction.client);
    }

    // Config subcommands: owner + Manage Channels only.
    const allowed = isOwner(interaction.user.id, interaction.guild?.id) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) === true;
    if (!allowed) {
      return reply(interaction, {
        embeds: [errorEmbed({ title: 'Permission Denied', description: 'You need the **Manage Channels** permission to configure tickets.' })],
        ephemeral: true,
      });
    }

    if (sub === 'setup') {
      const role = interaction.options.getRole('role');
      setStaffRole(interaction.guild.id, role.id);
      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'Staff Role Set',
            description: `Staff role set to <@&${role.id}>. They can now manage all tickets.`,
            extra: `By ${interaction.user.tag}`,
          }),
        ],
      });
    }

    if (sub === 'setlog') {
      const channel = interaction.options.getChannel('channel');
      if (!channel.isTextBased()) {
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Invalid Channel', description: 'Please pick a text channel.' })],
          ephemeral: true,
        });
      }
      setLogChannel(interaction.guild.id, channel.id);
      return reply(interaction, {
        embeds: [
          successEmbed({
            title: 'Log Channel Set',
            description: `Transcript log channel set to <#${channel.id}>.`,
            extra: `By ${interaction.user.tag}`,
          }),
        ],
      });
    }

    // sub === 'panel'
    const channel = interaction.options.getChannel('channel');
    if (!channel.isTextBased()) {
      return reply(interaction, {
        embeds: [errorEmbed({ title: 'Invalid Channel', description: 'Please pick a text channel.' })],
        ephemeral: true,
      });
    }
    const content = buildPanelContent(interaction.client);
    await channel.send(content);
    return reply(interaction, {
      embeds: [
        infoEmbed({
          title: 'Panel Posted',
          description: `Ticket panel posted in <#${channel.id}>.`,
          extra: `By ${interaction.user.tag}`,
        }),
      ],
      ephemeral: true,
    });
  },
};
