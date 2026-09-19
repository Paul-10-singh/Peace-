/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isOwner } = require('../../utils/owners');
const { sendLog } = require('../../utils/logging');
const { commandEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Delete and recreate the current channel (Manage Channels)'),
  async execute(interaction) {
    const canNuke = isOwner(interaction.user.id, interaction.guild?.id) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
    if (!canNuke) {
      return interaction.reply({
        content: 'You need the **Manage Channels** permission to nuke a channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({ content: 'This command can only be used in a text channel.', flags: MessageFlags.Ephemeral });
    }

    const overwrites = [...channel.permissionOverwrites.cache.values()].map((p) => ({
      id: p.id,
      allow: p.allow,
      deny: p.deny,
    }));

    const name = channel.name;
    const parentId = channel.parentId;
    const topic = channel.topic;
    const nsfw = channel.nsfw;
    const position = channel.position;
    const type = channel.type;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await channel.delete(`Channel nuked by ${interaction.user.tag}`).catch(() => null);

    const created = await interaction.guild.channels
      .create({
        name,
        type,
        parent: parentId,
        topic,
        nsfw,
        permissionOverwrites: overwrites,
        reason: `Channel recreated by ${interaction.user.tag}`,
      })
      .catch(() => null);

    if (!created) {
      return interaction.editReply({
        embeds: [
commandEmbed({
          title: '<a:warning:1550504965955653723> Channel Nuked',
          description: 'Channel deleted, but recreation failed.',
        }),
        ],
      }).catch(() => {});
    }

    await created.setPosition(position).catch(() => {});

    const embed = commandEmbed({
      title: '<a:warning:1550504965955653723> Channel Nuked',
      description: `**#${created.name}** has been recreated.`,
      fields: [
        { name: 'Channel', value: `#${created.name}`, inline: true },
        { name: 'Action taken by', value: `<@${interaction.user.id}>`, inline: true },
      ],
      extra: `By ${interaction.user.tag}`,
    });

    await created.send({ embeds: [embed] }).catch(() => {});
    await sendLog(interaction.client, interaction.guild.id, 'moderation', { embeds: [embed] });
    await interaction.editReply({ embeds: [embed] }).catch(() => {});
  },
};
