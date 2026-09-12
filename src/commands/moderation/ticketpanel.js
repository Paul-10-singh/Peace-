/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { reply } = require('../../utils/helpers');
const { isOwner } = require('../../utils/owners');
const {
  CATEGORIES,
  categoryOf,
  getConfig,
  nextTicketId,
  openTicket,
  getOpenTicket,
  getTicketByChannel,
  closeTicket,
} = require('../../utils/tickets');
const { generateTranscript } = require('../../utils/transcript');
const { commandEmbed, successEmbed, infoEmbed, errorEmbed, loadingEmbed } = require('../../utils/decorations');

// The embed + components posted in the configured panel channel.
function buildPanelContent(client) {
  const embed = commandEmbed({
    title: '🎫 Ticket Support',
    image: client.user.bannerURL?.({ size: 1024 }) || 'https://cdn.discordapp.com/attachments/',
    description: [
      'Welcome to **PeaceX** support.',
      '',
      '**Terms & Rules**',
      '• Do not open duplicate tickets.',
      '• One open ticket per category at a time.',
      '• Staff can close any ticket at any time.',
      '',
      '**Below, pick a category to open a private ticket.**',
    ].join('\n'),
    extra: 'Ticket System',
  });

  const guideRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_guide').setLabel('📘 Ticket Guide').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_rules').setLabel('📜 Server Rules').setStyle(ButtonStyle.Secondary)
  );

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Choose a ticket category…')
      .addOptions(
        CATEGORIES.map((c) => ({
          label: `${c.emoji} ${c.label}`,
          value: c.id,
          description: c.description,
        }))
      )
  );

  return { embeds: [embed], components: [guideRow, selectRow] };
}

// Permission overwrites array accepted directly by channel.create.
function overwritesFor(guildId, config, userId) {
  const list = [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];
  if (config.staffRole) {
    list.push({
      id: config.staffRole,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }
  return list;
}

// Creates the private ticket channel and welcome message.
async function openTicketFlow(interaction, categoryId) {
  const category = categoryOf(categoryId);
  if (!category) return;

  const guildId = interaction.guild.id;
  const config = getConfig(guildId);

  // One open ticket per user per category.
  const existing = getOpenTicket(guildId, interaction.user.id, categoryId);
  if (existing) {
    const ch = interaction.guild.channels.cache.get(existing.channelId);
    if (ch) {
      return reply(interaction, {
        embeds: [
          infoEmbed({
            title: 'Ticket Already Open',
            description: `You already have an open **${category.label}** ticket in <#${ch.id}>.`,
          }),
        ],
        ephemeral: true,
      });
    }
  }

  // Nest under a "Tickets" category, creating it if needed.
  let parent =
    interaction.guild.channels.cache.find((c) => c.type === 4 && c.name.toLowerCase() === 'tickets') ||
    null;
  if (!parent) {
    parent = await interaction.guild.channels.create({ name: 'Tickets', type: 4, reason: 'Peace✘ ticket system' }).catch(() => null);
  }

  const ticketId = nextTicketId();
  const number = ticketId.split('-')[1];
  const name = `ticket-${category.id.replace(/^ticket-/, '')}-${number}`;

  const channel = await interaction.guild.channels.create({
    name,
    type: 0,
    parent: parent?.id ?? null,
    permissionOverwrites: overwritesFor(guildId, config, interaction.user.id),
    reason: `Ticket ${ticketId} opened by ${interaction.user.tag}`,
  });

  openTicket(guildId, {
    userId: interaction.user.id,
    categoryId: category.id,
    categoryLabel: category.label,
    ticketId,
    channelId: channel.id,
    createdAt: Date.now(),
    closed: false,
  });

  const welcome = successEmbed({
    title: category.label,
    description: [
      `**Ticket ID:** \`${ticketId}\``,
      `**Opened by:** ${interaction.user.tag}`,
      '',
      'Please describe your request — a member of the team will be with you shortly.',
      'Press **Close Ticket** when you are done.',
    ].join('\n'),
    extra: 'One ticket per category at a time',
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [welcome], components: [closeRow] });
  await reply(interaction, {
    embeds: [
      successEmbed({
        title: 'Ticket Opened',
        description: `Your **${category.label}** ticket is ready: <#${channel.id}>`,
        extra: `Ticket ${ticketId}`,
      }),
    ],
    ephemeral: true,
  });
}

function isTicketStaff(interaction, config, guildId) {
  if (isOwner(interaction.user.id, interaction.guild?.id)) return true;
  if (config.staffRole) {
    return interaction.member?.roles?.cache?.has(config.staffRole) === true;
  }
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) === true;
}

// Closes a ticket: generates an HTML transcript, posts it to the configured log
// channel with the transcript embed, marks the ticket closed, then deletes the
// channel. Deleting right after the transcript is saved is simpler than a
// toggle—no orphaned locked channels if the log never lands.
async function closeTicketFlow(interaction, client) {
  const channel = interaction.channel;
  const guild = channel?.guild || interaction.guild;
  if (!channel || !channel.isTextBased()) {
    return reply(interaction, {
      embeds: [errorEmbed({ title: 'Not a Ticket Channel', description: 'This can only be used inside a ticket channel.' })],
      ephemeral: true,
    });
  }

  const config = getConfig(guild.id);
  const ticket = getTicketByChannel(guild.id, channel.id);
  const ticketLabel = ticket?.ticketId || channel.name;

  // Only the ticket creator or staff can close.
  const isCreator = ticket?.userId === interaction.user.id;
  const isStaff = isTicketStaff(interaction, config, guild.id);
  if (!isCreator && !isStaff) {
    return reply(interaction, {
      embeds: [errorEmbed({ title: 'Permission Denied', description: 'Only the ticket creator or staff can close this ticket.' })],
      ephemeral: true,
    });
  }

  await reply(interaction, {
    embeds: [loadingEmbed({ title: 'Closing Ticket', description: `Closing ticket **${ticketLabel}**…` })],
    ephemeral: true,
  });

  // Lock the channel briefly before saving the transcript.
  await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }).catch(() => {});

  const html = await generateTranscript(client, channel).catch(() => null);
  const buffer = Buffer.from(html || '<html><body><p>No transcript available.</p></body></html>', 'utf8');

  const transcriptEmbed = commandEmbed({
    title: `Ticket Transcript — ${ticketLabel}`,
    fields: [
      { name: 'Ticket ID', value: `\`${ticketLabel}\``, inline: true },
      { name: 'Category', value: ticket?.categoryLabel || '—', inline: true },
      { name: 'Creator', value: ticket?.userId ? `<@${ticket.userId}>` : '—', inline: true },
      { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true },
    ],
    extra: `Closed ${new Date().toLocaleString()}`,
  });

  if (config.logChannel) {
    const logChannel = guild.channels.cache.get(config.logChannel);
    if (logChannel?.isTextBased()) {
      await logChannel
        .send({ embeds: [transcriptEmbed], files: [{ attachment: buffer, name: `${ticketLabel}.html` }] })
        .catch(() => {});
    }
  }

  closeTicket(guild.id, channel.id);
  await channel.delete(`Ticket ${ticketLabel} closed by ${interaction.user.tag}`).catch(() => {});
}

module.exports = { buildPanelContent, openTicketFlow, closeTicketFlow, isTicketStaff };
