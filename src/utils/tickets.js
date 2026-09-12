/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'tickets.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ config: {}, counter: 0, tickets: {} }, null, 2), 'utf8');

let cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (!cache.config) cache.config = {};
if (!cache.tickets) cache.tickets = {};

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

// Ticket id prefix (e.g. the "TNC" in "TNC-0192").
const TICKET_PREFIX = 'TNC';

// Ticket categories. Adding a category here is all that's needed to expose it in
// the panel select menu and handlers.
const CATEGORIES = [
  { id: 'ticket-guild-joining', label: 'Guild Joining', emoji: '🏢', description: 'Application-style ticket for joining the guild' },
];

function categoryOf(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

function getConfig(guildId) {
  if (!cache.config[guildId]) {
    cache.config[guildId] = { staffRole: null, logChannel: null };
    persist();
  }
  return cache.config[guildId];
}

function setStaffRole(guildId, roleId) {
  const config = getConfig(guildId);
  config.staffRole = roleId;
  persist();
  return config;
}

function setLogChannel(guildId, channelId) {
  const config = getConfig(guildId);
  config.logChannel = channelId;
  persist();
  return config;
}

// Returns the next ticket id formatted like TNC-0001 and advances the counter.
function nextTicketId() {
  cache.counter += 1;
  const padded = String(cache.counter).padStart(4, '0');
  persist();
  return `${TICKET_PREFIX}-${padded}`;
}

function guildTickets(guildId) {
  if (!Array.isArray(cache.tickets[guildId])) cache.tickets[guildId] = [];
  return cache.tickets[guildId];
}

function openTicket(guildId, entry) {
  guildTickets(guildId).push(entry);
  persist();
  return entry;
}

// Returns an open ticket for this user+category, or null. Keeps one open ticket
// per user per category (prevents spam-opening).
function getOpenTicket(guildId, userId, categoryId) {
  const open = guildTickets(guildId).find(
    (t) => t.userId === userId && t.categoryId === categoryId && !t.closed
  );
  return open || null;
}

function getTicketByChannel(guildId, channelId) {
  return guildTickets(guildId).find((t) => t.channelId === channelId && !t.closed) || null;
}

function closeTicket(guildId, channelId) {
  const ticket = getTicketByChannel(guildId, channelId);
  if (ticket) ticket.closed = true;
  persist();
  return ticket;
}

module.exports = {
  TICKET_PREFIX,
  CATEGORIES,
  categoryOf,
  getConfig,
  setStaffRole,
  setLogChannel,
  nextTicketId,
  openTicket,
  getOpenTicket,
  getTicketByChannel,
  closeTicket,
};