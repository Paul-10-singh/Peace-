/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, successEmbed, warningEmbed, errorEmbed } = require('../../utils/decorations');
const { isOwner } = require('../../utils/owners');
const { sendLog } = require('../../utils/logging');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('msgall')
    .setDescription('DM all members in the server (Owner only)')
    .addStringOption((o) => o.setName('message').setDescription('The message to send').setRequired(true))
    .addAttachmentOption((o) => o.setName('attachment').setDescription('Optional attachment to include').setRequired(false))
    .addStringOption((o) =>
      o
        .setName('color')
        .setDescription('Embed color hex (e.g. FF0000 for red). Leave empty for default.')
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isOwner(interaction.user.id, interaction.guild?.id)) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Permission Denied', description: 'This command is restricted to the bot owner.' })],
        ephemeral: true,
      });
    }

    const message = interaction.options.getString('message').trim();
    if (!message) {
      return reply(interaction, {
        embeds: [warningEmbed({ title: 'Empty Message', description: 'Message cannot be empty.' })],
        ephemeral: true,
      });
    }

    const attachmentOption = interaction.options.getAttachment('attachment');
    const colorInput = interaction.options.getString('color');

    let embedColor = undefined;
    if (colorInput) {
      const hex = colorInput.replace(/^#/, '');
      const parsed = parseInt(hex, 16);
      if (isNaN(parsed)) {
        return reply(interaction, {
          embeds: [errorEmbed({ title: 'Invalid Color', description: 'Provide a valid hex color (e.g. `FF0000`).' })],
          ephemeral: true,
        });
      }
      embedColor = parsed;
    }

    // Defer so we have time to DM everyone
    await interaction.deferReply({ ephemeral: true });

    // Fetch all members
    let members;
    try {
      members = await interaction.guild.members.fetch({ withGuild: false });
    } catch {
      return reply(interaction, {
        embeds: [errorEmbed({ title: 'Fetch Failed', description: 'Could not fetch server members.' })],
        ephemeral: true,
      });
    }

    // Filter: only human members the bot can DM
    const targets = members.filter(
      (m) => !m.user.bot && m.id !== interaction.user.id,
    );

    let sent = 0;
    let failed = 0;
    const failedNames = [];

    for (const [, member] of targets) {
      const embed = commandEmbed({
        title: `📬 Message from ${interaction.guild.name}`,
        description: message,
        extra: `Sent by ${interaction.user.tag}`,
      });

      if (embedColor !== undefined) embed.setColor(embedColor);

      const payload = { embeds: [embed] };
      if (attachmentOption) {
        payload.files = [{ attachment: attachmentOption.url, name: attachmentOption.name }];
      }

      try {
        await member.send(payload);
        sent++;
      } catch {
        failed++;
        failedNames.push(member.user.tag);
      }
    }

    const resultEmbed = successEmbed({
      title: '📨 Message All — Complete',
      fields: [
        { name: 'Total Targets', value: `${targets.size}`, inline: true },
        { name: 'Sent', value: `${sent}`, inline: true },
        { name: 'Failed', value: `${failed}`, inline: true },
      ],
      description: failedNames.length
        ? `Failed to DM: ${failedNames.slice(0, 15).join(', ')}${failedNames.length > 15 ? ` (+${failedNames.length - 15} more)` : ''}`
        : 'All messages delivered successfully.',
    });

    await reply(interaction, { embeds: [resultEmbed], ephemeral: true });

    await sendLog(interaction.client, interaction.guild.id, 'moderation', {
      embeds: [
        commandEmbed({
          title: '📨 Mass DM sent',
          fields: [
            { name: 'Sender', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Targets', value: `${targets.size}`, inline: true },
            { name: 'Sent', value: `${sent}`, inline: true },
            { name: 'Failed', value: `${failed}`, inline: true },
            { name: 'Message', value: message.length > 900 ? message.slice(0, 900) + '…' : message },
          ],
        }),
      ],
    });
  },
};
