/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { isOwner } = require('../utils/owners');
const { MessageFlags } = require('discord.js');
const { reply } = require('../utils/helpers');
const { setDmNotify } = require('../utils/afk');
const { MAX_NOTES, getUserNotes, addNote, editNote } = require('../utils/notes');
const { getCommandForInteraction } = require('../utils/commandGroups');

/* eslint-disable */
/* eslint-enable */

// DiscordAPIError codes that are harmless races (expired token, already acked,
// duplicate instance, or bot restart via `node --watch`). Never crash or spam
// logs for these.
function isTransientInteractionError(err) {
  if (typeof err?.code !== 'number') return false;
  return [10062, 10060, 40060, 10063, 50027].includes(err.code);
}

function logCommandFailure(scope, err) {
  if (isTransientInteractionError(err)) return; // silent: interaction already handled/expired
  console.error(`[PeaceX] [Commands] Error in ${scope}:`, err);
}

async function handleAfkButton(interaction) {
  const afk = require('../commands/utility/afk.js');
  const notify = interaction.customId === 'afk_dm_on';
  setDmNotify(interaction.user.id, notify);
  const panel = afk.statusPayload(interaction.user.id, interaction.user);
  await interaction.update({ ...panel }).catch(() => {});
}

async function handleNotePage(interaction) {
  const page = parseInt(interaction.customId.replace('note_page_', ''), 10);
  const note = require('../commands/utility/note.js');
  const payload = note.buildList(interaction.user.id, interaction.user, page);
  await interaction.update({ ...payload }).catch(() => {});
}

async function handleNoteModal(interaction) {
  const content = interaction.fields.getTextInputValue('note_content').trim();
  if (!content) {
    return interaction.reply({ content: 'Note content cannot be empty.', flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === 'note_add') {
    if (getUserNotes(interaction.user.id).length >= MAX_NOTES) {
      return interaction.reply({
        content: `You have reached the **${MAX_NOTES}-note** limit. Remove a note first with \`/note remove\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const { note } = addNote(interaction.user.id, content);
    return interaction.reply({ content: `<:ticknew:1536133967709741086> Note **#${note.number}** saved.`, flags: MessageFlags.Ephemeral });
  }

  const number = parseInt(interaction.customId.replace('note_edit_', ''), 10);
  const note = editNote(interaction.user.id, number, content);
  if (!note) {
    return interaction.reply({ content: `You don't have a note **#${number}**.`, flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ content: `<:ticknew:1536133967709741086> Note **#${number}** updated.`, flags: MessageFlags.Ephemeral });
}

module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction) {
    if (interaction.isChatInputCommand()) {
      const registeredCommand = client.commands.get(interaction.commandName);
      if (!registeredCommand) return;

      const { hasAccess } = require('../utils/permissions');
      const sub = interaction.options.getSubcommand(false);
      const command = getCommandForInteraction(registeredCommand, sub);
      const allowed = command.ownerOnly ? isOwner(interaction.user.id, interaction.guild?.id) : hasAccess(interaction.member || interaction.user, interaction.guild, command.data.name, sub);
      if (!allowed) {
        return interaction.reply({ content: '<:cross:1534849320568750221> You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      try {
        const previous = client.embedModule;
        client.embedModule = command.__folder;
        try {
          await command.execute(interaction, client);
        } finally {
          client.embedModule = previous;
        }
      } catch (err) {
        if (isTransientInteractionError(err)) return;
        logCommandFailure(`/${interaction.commandName}`, err);
        // Never crash the process on a failed reply (stale/duplicate interactions).
        const content = { content: 'Something went wrong while running this command.', flags: MessageFlags.Ephemeral };
        const attempt =
          interaction.deferred || interaction.replied ? interaction.followUp(content) : interaction.reply(content);
        await attempt.catch(() => {});
      }
    }

    if (interaction.isMessageContextMenuCommand() || interaction.isUserContextMenuCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      const { hasAccess } = require('../utils/permissions');
      const allowed = command.ownerOnly ? isOwner(interaction.user.id, interaction.guild?.id) : hasAccess(interaction.member || interaction.user, interaction.guild, command.data.name, undefined);
      if (!allowed) {
        return interaction.reply({ content: '<:cross:1534849320568750221> You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      try {
        const previous = client.embedModule;
        client.embedModule = command.__folder;
        try {
          await command.execute(interaction, client);
        } finally {
          client.embedModule = previous;
        }
      } catch (err) {
        if (isTransientInteractionError(err)) return;
        logCommandFailure(`${interaction.commandName} (context menu)`, err);
        const content = { content: 'Something went wrong while running this command.', flags: MessageFlags.Ephemeral };
        const attempt =
          interaction.deferred || interaction.replied ? interaction.followUp(content) : interaction.reply(content);
        await attempt.catch(() => {});
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('sec:')) {
        const { handleComponent } = require('../utils/securityPanel');
        await handleComponent(interaction);
        return;
      }
      if (interaction.customId.startsWith('afk_')) {
        await handleAfkButton(interaction);
        return;
      }
      if (interaction.customId.startsWith('note_page_')) {
        await handleNotePage(interaction);
        return;
      }
      if (interaction.customId === 'ticket_guide' || interaction.customId === 'ticket_rules') {
        await interaction.reply({
          content:
            interaction.customId === 'ticket_guide'
              ? '📘 **Ticket Guide**\nPick a category in the menu below to open a private ticket. A staff member will assist you inside the ticket channel. Press **Close Ticket** when finished.'
              : '📜 **Server Rules**\nFollow the server rules at all times. Tickets found to be abusing the system may be closed without notice.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (interaction.customId === 'ticket_close') {
        const { closeTicketFlow } = require('../commands/moderation/ticketpanel.js');
        await closeTicketFlow(interaction, client);
        return;
      }
      // Acknowledge buttons from older/removed panels so Discord does not show
      // "The application did not respond" for stale component messages.
      await interaction.deferUpdate().catch(() => {});
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('sec:add:')) {
        const { handleComponent } = require('../utils/securityPanel');
        await handleComponent(interaction);
        return;
      }
      if (interaction.customId === 'note_add' || interaction.customId.startsWith('note_edit_')) {
        await handleNoteModal(interaction);
      }
      if (interaction.customId.startsWith('tempvc:modal:')) {
        const { handleModal } = require('../utils/tempvcPanel');
        await handleModal(interaction).catch(() => {});
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('sec:')) {
        const { handleComponent } = require('../utils/securityPanel');
        await handleComponent(interaction);
        return;
      }
      if (interaction.customId.startsWith('tempvc:')) {
        const { handlePanel } = require('../utils/tempvcPanel');
        await handlePanel(interaction).catch(() => {});
        return;
      }
      if (interaction.customId === 'ticket_select' && interaction.values?.[0]) {
        const { openTicketFlow } = require('../commands/moderation/ticketpanel.js');
        await openTicketFlow(interaction, interaction.values[0]);
        return;
      }
      if (interaction.customId === 'help_menu') {
        const help = require('../commands/utility/help.js');
        const embed =
          interaction.values[0] === 'home'
            ? help.buildHomeEmbed(client, interaction.user, interaction.guild)
            : help.buildModuleEmbed(client, interaction.values[0], interaction.user, interaction.guild);
        await interaction.update({ embeds: [embed], components: [help.buildSelectMenu(client, interaction.user, interaction.guild)] });
      }
      // Acknowledge stale or unsupported select menus instead of leaving them
      // spinning until Discord reports an interaction timeout.
      if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`[PeaceX] [Commands] Autocomplete error in /${interaction.commandName}:`, err);
      }
    }
  },
};