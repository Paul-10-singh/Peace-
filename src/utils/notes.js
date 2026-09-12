/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'notes.json');

const MAX_NOTES = 15;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');

let cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function getUserNotes(userId) {
  if (!Array.isArray(cache[userId])) cache[userId] = [];
  return cache[userId];
}

function nextNumber(userId) {
  const used = new Set(getUserNotes(userId).map((n) => n.number));
  for (let i = 1; i <= MAX_NOTES; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

function addNote(userId, content) {
  const notes = getUserNotes(userId);
  if (notes.length >= MAX_NOTES) return { ok: false, error: 'limit' };
  const number = nextNumber(userId);
  if (!number) return { ok: false, error: 'limit' };
  const note = { number, content, createdAt: Date.now() };
  notes.push(note);
  persist();
  return { ok: true, note };
}

function getNote(userId, number) {
  return getUserNotes(userId).find((n) => n.number === number) || null;
}

function editNote(userId, number, content) {
  const note = getNote(userId, number);
  if (!note) return null;
  note.content = content;
  persist();
  return note;
}

function removeNote(userId, number) {
  const notes = getUserNotes(userId);
  const index = notes.findIndex((n) => n.number === number);
  if (index === -1) return null;
  const [removed] = notes.splice(index, 1);
  persist();
  return removed;
}

module.exports = { MAX_NOTES, getUserNotes, getNote, addNote, editNote, removeNote };