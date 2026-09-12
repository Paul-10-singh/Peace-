/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { reply } = require('../../utils/helpers');
const { MAX_NOTES, getUserNotes, getNote, addNote, editNote, removeNote } = require('../../utils/notes');
const { commandEmbed, warningEmbed, successEmbed } = require('../../utils/decorations');

const NOTES_PER_PAGE = 5;

function noteModal(number, existing) {
  const action = number === null ? 'Add note' : `Edit note #${number}`;
  const modal = new ModalBuilder()
    .setCustomId(number === null ? 'note_add' : `note_edit_${number}`)
    .setTitle(action);
  const input = new TextInputBuilder()
    .setCustomId('note_content')
    .setLabel('Note content')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setMinLength(1)
    .setRequired(true);
  if (existing?.content) input.setValue(existing.content);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildList(userId, user, page) {
  const notes = [...getUserNotes(userId)].sort((a, b) => a.number - b.number);
  const pages = Math.max(1, Math.ceil(notes.length / NOTES_PER_PAGE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const chunk = notes.slice(current * NOTES_PER_PAGE, current * NOTES_PER_PAGE + NOTES_PER_PAGE);

  const embed = commandEmbed({
    author: { name: `${user.username}'s notes`, iconURL: user.displayAvatarURL({ dynamic: true }) },
    description: chunk.length
      ? chunk.map((n) => `**#${n.number}**\n${n.content.length > 90 ? n.content.slice(0, 90) + '…' : n.content}`).join('\n\n')
      : 'You have no notes yet. Use `/note add` to create one.',
    extra: `Page ${current + 1}/${pages} • ${notes.length}/${MAX_NOTES} notes`,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`note_page_${current - 1}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current === 0),
    new ButtonBuilder()
      .setCustomId(`note_page_${current + 1}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= pages - 1)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Manage your personal notes')
    .addSubcommand((s) => s.setName('add').setDescription('Add a new note (opens a form)'))
    .addSubcommand((s) => s.setName('edit').setDescription('Edit an existing note')
      .addIntegerOption((o) => o.setName('number').setDescription('The note number to edit').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List all of your notes'))
    .addSubcommand((s) => s.setName('remove').setDescription('Delete a note')
      .addIntegerOption((o) => o.setName('number').setDescription('The note number to remove').setRequired(true))),
  buildModal: noteModal,
  buildList,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'add') {
      if (getUserNotes(userId).length >= MAX_NOTES) {
        return reply(interaction, {
          embeds: [warningEmbed({ title: 'Note limit reached', description: `You have reached the **${MAX_NOTES}-note** limit. Remove a note first with \`/note remove\`.` })],
          ephemeral: true,
        });
      }
      return interaction.showModal(noteModal(null, null));
    }

    if (sub === 'list') {
      return reply(interaction, { ...buildList(userId, interaction.user, 0), ephemeral: true });
    }

    const number = interaction.options.getInteger('number');

    if (sub === 'edit') {
      const note = getNote(userId, number);
      if (!note) return reply(interaction, { embeds: [warningEmbed({ title: 'Note not found', description: `You don't have a note **#${number}**.` })], ephemeral: true });
      return interaction.showModal(noteModal(number, note));
    }

    const removed = removeNote(userId, number);
    if (!removed) return reply(interaction, { embeds: [warningEmbed({ title: 'Note not found', description: `You don't have a note **#${number}**.` })], ephemeral: true });
    return reply(interaction, { embeds: [successEmbed({ title: 'Note removed', description: `Removed note **#${number}**.` })] });
  },
};