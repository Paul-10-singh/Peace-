/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - ui.js (Deliverable 5)
 *
 * Discord component builders. Every customId obeys the mockup contract:
 *   buttons:     tod:<area>:<action>:<ctx>  (ctx = gid:sid:uid when needed)
 *   selectMenus: tod:<area>:select:<ctx>
 *   modals:      tod:<area>:modal:<ctx>
 * Emojis always come from emojis.js (imported as E). Interaction handlers in
 * Deliverable 6 / Phase 6 parse these ids - see id parsing contract in the
 * handler module (parseCustomId()).
 */

'use strict';

const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { E } = require('./emojis');

// ---------------------------------------------------------------------------
// Tiny builders
// ---------------------------------------------------------------------------

function btn(customId, label, style, emoji) {
  const b = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function row(...components) {
  return new ActionRowBuilder().addComponents(components);
}

function select(customId, placeholder, options, { min = 1, max = 1 } = {}) {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(min)
    .setMaxValues(max)
    .addOptions(options);
}

function ctxIds({ guildId, sessionId, userId } = {}) {
  return [guildId, sessionId, userId].filter((v) => v != null).join(':');
}

// ---------------------------------------------------------------------------
// 1 - Main panel (ephemeral)
// ---------------------------------------------------------------------------

function mainPanelRow() {
  return [
    row(
      btn('tod:panel:start', 'Start Session', ButtonStyle.Success, E.panel),
      btn('tod:panel:settings', 'Settings', ButtonStyle.Secondary, E.settings),
      btn('tod:panel:prompts', 'Manage Prompts', ButtonStyle.Secondary, E.prompts)
    ),
    row(
      btn('tod:panel:stats', 'Stats', ButtonStyle.Secondary, E.stats),
      btn('tod:panel:history', 'History', ButtonStyle.Secondary, E.history)
    ),
  ];
}

// ---------------------------------------------------------------------------
// 2 - Lobby (public)
// ---------------------------------------------------------------------------

function lobbyRow() {
  return row(
    btn('tod:lobby:join', 'Join', ButtonStyle.Success, E.join),
    btn('tod:lobby:start', 'Start Now', ButtonStyle.Primary, E.start),
    btn('tod:lobby:leave', 'Leave', ButtonStyle.Secondary, E.leave)
  );
}

// ---------------------------------------------------------------------------
// 3 - Round (player's turn)
// customId: tod:round:truth:<gid>:<sid>:<uid> / dare / skip
// ---------------------------------------------------------------------------

function roundRow({ guildId, sessionId, userId }) {
  const ctx = ctxIds({ guildId, sessionId, userId });
  return row(
    btn(`tod:round:truth:${ctx}`, 'Truth', ButtonStyle.Primary, E.correct),
    btn(`tod:round:dare:${ctx}`, 'Dare', ButtonStyle.Danger, E.wrong),
    btn(`tod:round:skip:${ctx}`, 'Skip', ButtonStyle.Secondary, E.skip)
  );
}

// ---------------------------------------------------------------------------
// 4 - Prompt (truth/dare answer row)
// customId: tod:answer:done:<ctx> / skip / refuse
// ---------------------------------------------------------------------------

function promptRow({ guildId, sessionId, userId }) {
  const ctx = ctxIds({ guildId, sessionId, userId });
  return row(
    btn(`tod:answer:done:${ctx}`, 'Done', ButtonStyle.Success, E.done),
    btn(`tod:answer:skip:${ctx}`, 'Skip', ButtonStyle.Secondary, E.skip),
    btn(`tod:answer:refuse:${ctx}`, 'Refuse', ButtonStyle.Danger, E.refuse)
  );
}

// ---------------------------------------------------------------------------
// 5 - End-of-session summary
// ---------------------------------------------------------------------------

function endRow() {
  return row(
    btn('tod:end:again', 'Play Again', ButtonStyle.Success, E.playAgain),
    btn('tod:end:log', 'View Log', ButtonStyle.Secondary, E.history)
  );
}

// ---------------------------------------------------------------------------
// 7 - Settings rows (one StringSelectMenu per row; Discord caps 5 rows/message
// so the handler pages through the DEFAULT_SETTING_KEYS in batches).
// ---------------------------------------------------------------------------

const DEFAULT_SETTING_KEYS = [
  'intensity',
  'join_window',
  'turn_timer',
  'truth_timer',
  'dare_timer',
  'skip_tokens',
  'strikes_to_kick',
  'max_players',
  'categories',
];

const SETTING_META = {
  intensity: {
    label: 'Intensity',
    options: [
      new StringSelectMenuOptionBuilder().setLabel('PG').setValue('pg'),
      new StringSelectMenuOptionBuilder().setLabel('PG-13').setValue('pg13'),
      new StringSelectMenuOptionBuilder().setLabel('R').setValue('r'),
    ],
  },
  categories: {
    label: 'Categories',
    multi: true,
    options: [
      new StringSelectMenuOptionBuilder().setLabel('Funny').setValue('Funny'),
      new StringSelectMenuOptionBuilder().setLabel('Deep').setValue('Deep'),
      new StringSelectMenuOptionBuilder().setLabel('Weird').setValue('Weird'),
      new StringSelectMenuOptionBuilder().setLabel('Spicy (on/off)').setValue('Spicy'),
    ],
  },
  join_window: {
    label: 'Join window',
    options: [30, 60, 90].map((v) =>
      new StringSelectMenuOptionBuilder().setLabel(`${v}s`).setValue(String(v))),
  },
  turn_timer: {
    label: 'Turn timer',
    options: [15, 30, 45].map((v) =>
      new StringSelectMenuOptionBuilder().setLabel(`${v}s`).setValue(String(v))),
  },
  truth_timer: {
    label: 'Truth timer',
    options: [60, 120, 180].map((v) =>
      new StringSelectMenuOptionBuilder().setLabel(`${v}s`).setValue(String(v))),
  },
  dare_timer: {
    label: 'Dare timer',
    options: [180, 300, 600].map((v) =>
      new StringSelectMenuOptionBuilder().setLabel(`${v}s`).setValue(String(v))),
  },
  skip_tokens: {
    label: 'Skip tokens',
    options: [2, 3, 5].map((v) =>
      new StringSelectMenuOptionBuilder().setLabel(String(v)).setValue(String(v))),
  },
  strikes_to_kick: {
    label: 'Strikes to kick',
    options: [3, 4, 5].map((v) =>
      new StringSelectMenuOptionBuilder().setLabel(String(v)).setValue(String(v))),
  },
  max_players: {
    label: 'Max players',
    options: [10, 20, 50].map((v) =>
      new StringSelectMenuOptionBuilder().setLabel(String(v)).setValue(String(v))),
  },
};

const INTENSITY_TEXT = { pg: 'PG', pg13: 'PG-13', r: 'R' };

function settingsSelectRow(key, valueMap = {}) {
  const meta = SETTING_META[key];
  if (!meta) throw new TypeError(`tod: unknown setting "${key}"`);
  const raw = valueMap[key] != null ? String(valueMap[key]) : undefined;
  const current =
    key === 'intensity' ? (INTENSITY_TEXT[String(raw).toLowerCase()] || raw) : raw;
  const menu = select(`tod:settings:select:${key}`, `${meta.label} (current: ${current || '\u2014'})`, meta.options, {
    min: meta.multi ? 1 : 1,
    max: meta.multi ? meta.options.length : 1,
  });
  return row(menu);
}

function settingsSelectRows(keys = DEFAULT_SETTING_KEYS, valueMap = {}) {
  const wanted = keys.filter((k) => SETTING_META[k]);
  return wanted.slice(0, 5).map((k) => settingsSelectRow(k, valueMap));
}

// ---------------------------------------------------------------------------
// 10 - History pagination
// ---------------------------------------------------------------------------

function historyRow() {
  return row(
    btn('tod:history:prev', 'Prev', ButtonStyle.Secondary, E.prev),
    btn('tod:history:next', 'Next', ButtonStyle.Secondary, E.next),
    btn('tod:history:export', 'Export CSV', ButtonStyle.Secondary, E.export)
  );
}

// ---------------------------------------------------------------------------
// 11 - Session flow: channel pick + reopen + spicy confirm
// ---------------------------------------------------------------------------

function channelRow() {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId('tod:panel:select:channel')
    .setPlaceholder('Where should this session run?')
    .setChannelTypes([ChannelType.GuildText]);
  return row(menu);
}

function spicyConfirmRow() {
  return row(
    btn('tod:spicy:enable', 'Yes, enable', ButtonStyle.Danger, E.spicy),
    btn('tod:spicy:cancel', 'Cancel', ButtonStyle.Secondary, E.cancel)
  );
}

// ---------------------------------------------------------------------------
// 8 - Prompt manager buttons + delete picker + add modals
// ---------------------------------------------------------------------------

function promptManagerRow() {
  return row(
    btn('tod:prompts:add:truth', 'Add Truth', ButtonStyle.Success, E.correct),
    btn('tod:prompts:add:dare', 'Add Dare', ButtonStyle.Success, E.wrong),
    btn('tod:prompts:list', 'List', ButtonStyle.Secondary, E.prompts),
    btn('tod:prompts:delete', 'Delete', ButtonStyle.Secondary, E.trash),
    btn('tod:prompts:reload', 'Reload', ButtonStyle.Secondary, E.reload)
  );
}

// Returns a single delete-picker row, or null when there is nothing to delete
// (Discord needs between 1 and 25 options).
function promptDeleteRow(prompts) {
  if (!Array.isArray(prompts) || prompts.length === 0) return null;
  const options = prompts.slice(0, 25).map((p) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(p.prompt.length > 80 ? `${p.prompt.slice(0, 77)}...` : p.prompt)
      .setValue(String(p.id))
      .setDescription(`${p.kind} · ${p.category} · ${p.intensity}`)
  );
  return row(select('tod:prompts:select:delete', 'Choose a custom prompt to delete...', options));
}

function addPromptModal(kind) {
  if (kind !== 'truth' && kind !== 'dare') {
    throw new TypeError(`tod: modal kind must be 'truth' | 'dare' (got ${kind})`);
  }
  const title = kind === 'truth' ? 'New Truth' : 'New Dare';
  const name = kind === 'truth' ? E.correct : E.wrong;

  const text = new TextInputBuilder()
    .setCustomId('prompt_text')
    .setLabel(`Prompt text (max 200 chars)`)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(200)
    .setRequired(true);

  const category = new TextInputBuilder()
    .setCustomId('prompt_category')
    .setLabel('Category: one of Funny, Deep, Weird, Spicy')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(20)
    .setValue('Funny')
    .setRequired(true);

  const intensity = new TextInputBuilder()
    .setCustomId('prompt_intensity')
    .setLabel('Intensity: pg, pg13 or r')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(4)
    .setValue('pg13')
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`tod:prompts:modal:${kind}`)
    .setTitle(`${name} ${title}`)
    .addComponents(
      row(text),
      row(category),
      row(intensity)
    );
}

module.exports = {
  btn,
  row,
  ctxIds,
  mainPanelRow,
  lobbyRow,
  roundRow,
  promptRow,
  endRow,
  DEFAULT_SETTING_KEYS,
  SETTING_META,
  settingsSelectRow,
  settingsSelectRows,
  historyRow,
  channelRow,
  spicyConfirmRow,
  promptManagerRow,
  promptDeleteRow,
  addPromptModal,
};