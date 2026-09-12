/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'todos.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');

let cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function getUserTodos(userId) {
  if (!Array.isArray(cache[userId])) cache[userId] = [];
  return cache[userId];
}

function addTodo(userId, text) {
  const todos = getUserTodos(userId);
  const id = todos.length ? Math.max(...todos.map((t) => t.id)) + 1 : 1;
  todos.push({ id, text, done: false, createdAt: Date.now() });
  persist();
  return todos[todos.length - 1];
}

function getTodos(userId) {
  return getUserTodos(userId);
}

function completeTodo(userId, id) {
  const todo = getUserTodos(userId).find((t) => t.id === id);
  if (!todo) return null;
  todo.done = true;
  persist();
  return todo;
}

function editTodo(userId, id, text) {
  const todo = getUserTodos(userId).find((t) => t.id === id);
  if (!todo) return null;
  todo.text = text;
  persist();
  return todo;
}

function removeTodo(userId, id) {
  const todos = getUserTodos(userId);
  const index = todos.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const [removed] = todos.splice(index, 1);
  persist();
  return removed;
}

module.exports = { addTodo, getTodos, completeTodo, editTodo, removeTodo };
