/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { addTodo, getTodos, completeTodo, editTodo, removeTodo } = require('../../utils/todos');
const { commandEmbed, infoEmbed, warningEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('todo')
    .setDescription('Manage your personal todo list')
    .addSubcommand((s) => s.setName('add').setDescription('Add a task to your todo list')
      .addStringOption((o) => o.setName('task').setDescription('The task to add').setRequired(true)))
    .addSubcommand((s) => s.setName('complete').setDescription('Mark a task as completed')
      .addIntegerOption((o) => o.setName('id').setDescription('The task ID (see /todo list)').setRequired(true)))
    .addSubcommand((s) => s.setName('edit').setDescription('Edit a task')
      .addIntegerOption((o) => o.setName('id').setDescription('The task ID (see /todo list)').setRequired(true))
      .addStringOption((o) => o.setName('task').setDescription('The new task text').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List your tasks'))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a task')
      .addIntegerOption((o) => o.setName('id').setDescription('The task ID (see /todo list)').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'list') {
      const todos = getTodos(userId);
      if (!todos.length) {
        return reply(interaction, { embeds: [infoEmbed({ description: 'Your todo list is empty. Add a task with `/todo add`.' })], ephemeral: true });
      }
      const lines = todos.map(
        (t) => `${t.done ? '<:tick:1534848038609358939>' : '⬜'} **${t.id}.** ${t.text}`
      );
      const embed = commandEmbed({
        author: { name: `${interaction.user.tag}'s todo list`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) },
        description: lines.join('\n'),
        extra: `${todos.filter((t) => t.done).length}/${todos.length} completed`,
      });
      return reply(interaction, { embeds: [embed] });
    }

    if (sub === 'add') {
      const task = interaction.options.getString('task').trim();
      if (!task) return reply(interaction, { embeds: [warningEmbed({ title: 'Empty task', description: 'Task cannot be empty.' })], ephemeral: true });
      const todo = addTodo(userId, task);
      return reply(interaction, { embeds: [successEmbed({ title: 'Task added', description: `Added **#${todo.id}**: ${todo.text}` })] });
    }

    const id = interaction.options.getInteger('id');

    if (sub === 'complete') {
      const todo = completeTodo(userId, id);
      if (!todo) return reply(interaction, { embeds: [warningEmbed({ title: 'No task found', description: `No task with ID **${id}** found.` })], ephemeral: true });
      return reply(interaction, { embeds: [successEmbed({ title: 'Task completed', description: `Completed **#${id}**: ~~${todo.text}~~` })] });
    }

    if (sub === 'edit') {
      const text = interaction.options.getString('task').trim();
      if (!text) return reply(interaction, { embeds: [warningEmbed({ title: 'Empty task', description: 'Task cannot be empty.' })], ephemeral: true });
      const todo = editTodo(userId, id, text);
      if (!todo) return reply(interaction, { embeds: [warningEmbed({ title: 'No task found', description: `No task with ID **${id}** found.` })], ephemeral: true });
      return reply(interaction, { embeds: [successEmbed({ title: 'Task edited', description: `Edited **#${id}** → ${todo.text}` })] });
    }

    const todo = removeTodo(userId, id);
    if (!todo) return reply(interaction, { embeds: [warningEmbed({ title: 'No task found', description: `No task with ID **${id}** found.` })], ephemeral: true });
    return reply(interaction, { embeds: [successEmbed({ title: 'Task removed', description: `Removed **#${id}**: ${todo.text}` })] });
  },
};
