/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - embeds.js (Deliverable 5)
 *
 * Embed builders matching mockup_tod.txt (UI MOCKUPS v1). Every embed:
 *   - title starts with an emoji from emojis.js (never hardcoded here)
 *   - color follows the GLOBAL RULES accents
 *   - footer is "Peace* Truth or Dare · <relative timestamp>"
 * All builders are pure (no IO); the interaction layer feeds them data from
 * store/game and the client for iconURL.
 */

'use strict';

const { EmbedBuilder } = require('discord.js');
const { E } = require('./emojis');

const COLORS = {
  active: 0x57f287,   // ACTIVE green
  inactive: 0xed4245, // INACTIVE red
  neutral: 0x2b2d31,  // neutral dark
  info: 0x5865f2,     // info blurple
  gold: 0xffd700,     // gold (leader #1)
};

const FOOTER = 'Peace\u2718 Truth or Dare';

function stamp(value = Date.now(), style = 'R') {
  const seconds =
    typeof value === 'number'
      ? Math.floor(value / 1000)
      : Math.floor(new Date(value).getTime() / 1000);
  return `<t:${seconds}:${style}>`;
}

function footerText(value = Date.now()) {
  return `${FOOTER} \u00b7 ${stamp(value, 'R')}`;
}

// opts: { color, title, description, fields[], iconURL, at }
// Title is prefixed with `mark` (required by the global rules).
function base(mark, title, opts = {}) {
  const embed = new EmbedBuilder()
    .setColor(opts.color ?? COLORS.info)
    .setTitle(mark ? `${mark} ${title}`.trimEnd() : title)
    .setFooter({ text: footerText(opts.at) });
  if (opts.iconURL) embed.setFooter({ text: footerText(opts.at), iconURL: opts.iconURL });
  if (opts.description) embed.setDescription(opts.description);
  if (opts.fields && opts.fields.length) embed.addFields(opts.fields);
  return embed;
}

const INTENSITY_MAP = { pg: 'PG', pg13: 'PG-13', r: 'R' };

function intensityLabel(raw) {
  const lower = String(raw || '').toLowerCase();
  return INTENSITY_MAP[lower] || lower.toUpperCase() || 'PG-13';
}

// ---------------------------------------------------------------------------
// 1 AND 6 - Main panel (idle / no history)
// ---------------------------------------------------------------------------

function mainPanel({ intensity, categories, roundsPlayed, longestSession,
  hasHistory, iconURL } = {}) {
  const desc = [
    `**Status:** Idle \u00b7 No active session`,
    `**Intensity:** ${intensityLabel(intensity)} \u00b7 **Categories:** ${categories || 'Funny, Deep, Weird'}`,
    `**Rounds Played:** ${roundsPlayed ?? 0} \u00b7 **Longest Session:** ${longestSession || '\u2014'}`,
    '',
    '**\u2014\u2014 How it works \u2014\u2014**',
    `1. Press [${E.start} Start Session] to open a lobby in this channel`,
    '2. Players press [Join] within the 60s join window',
    '3. Bot picks a random player \u2014 they pick Truth or Dare',
    '4. Each round: 1 turn per player \u00b7 all can hop in',
  ].join('\n');
  const body = hasHistory
    ? desc
    : `${desc}\n\n_No sessions yet \u2014 hit [${E.panel} Start Session] to be the first!_`;
  return base(E.panel, 'Truth or Dare', {
    color: COLORS.info,
    description: body,
    iconURL,
  });
}

// ---------------------------------------------------------------------------
// 2 - Lobby (public)
// ---------------------------------------------------------------------------

function lobby({ hostMention, channelMention, intensity, categories,
  joinWindowS, turnTimerS, players, maxPlayers, iconURL } = {}) {
  const count = Array.isArray(players) ? players.length : 0;
  const rows = Array.isArray(players)
    ? players.map((p, i) => `${String(i + 1).padStart(2, '0')}. ${p}`).join('  ')
    : '\u2014';
  const desc = [
    `**Host:** ${hostMention || '\u2014'}`,
    `**Channel:** ${channelMention || '\u2014'}`,
    `**Intensity:** ${intensityLabel(intensity)} \u00b7 **Categories:** ${categories || 'Funny, Deep, Weird'}`,
    `${E.timer} ${joinWindowS || 60}s join window \u00b7 ${turnTimerS || 30}s to choose  [${intensityLabel(intensity)} badge]`,
    '',
    `**Players (${count}/${maxPlayers || 20}):**`,
    rows || participantsLine(players),
    '',
    'Join by pressing the button below!',
  ].join('\n');
  return base(E.panel, 'Truth or Dare \u2014 Lobby', {
    color: COLORS.active,
    description: desc,
    iconURL,
    at: Date.now(),
  });
}

function participantsLine(players) {
  if (!Array.isArray(players) || players.length === 0) return '\u2014';
  return players
    .map((p) => `<@${p}>`)
    .map((m, i) => `${String(i + 1).padStart(2, '0')}. ${m}`)
    .join('  ');
}

// ---------------------------------------------------------------------------
// 3 - Player's turn
// ---------------------------------------------------------------------------

function playerTurn({ roundNo, currentUser, orderLine, turnTimerS, iconURL } = {}) {
  const desc = [
    orderLine ? `This round: ${orderLine}` : '',
    '',
    `Choose your fate, ${currentUser || '\u2014'}:`,
  ].filter(Boolean).join('\n');
  return base(`${E.panel} Round ${roundNo || 1} \u2014 ${currentUser || '\u2014'}'s turn!`, '', {
    color: COLORS.active,
    description: `${desc}\n\n${E.timer} You have **${turnTimerS || 30} seconds** to choose (auto-skip on timeout)`,
    iconURL,
  });
}

// ---------------------------------------------------------------------------
// 4 - Prompt (Truth / Dare)
// ---------------------------------------------------------------------------

function prompt({ kind, category, intensity, text, answerUser, timerLabel,
  iconURL } = {}) {
  const k = kind === 'dare' ? 'Dare' : 'Truth';
  const line = `${E.panel} ${k} \u00b7 ${category || '\u2014'} \u00b7 ${intensityLabel(intensity)}`;
  const desc = [
    `\u201c${text || '\u2014'}\u201d`,
    '',
    `${E.timer} Answer within **${timerLabel || '2 minutes'}**`,
  ].join('\n');
  return base(line, '', {
    color: COLORS.neutral,
    description: desc,
    iconURL,
  });
}

// ---------------------------------------------------------------------------
// 4 STATES - round feedback
// ---------------------------------------------------------------------------

function defaultFeedbackText(action, user, roundNo, detail) {
  if (detail) return detail;
  const who = user || '\u2014';
  switch (action) {
    case 'done':
      return `${E.done} ${who} completed it! Round ${roundNo || '\u2014'} \u2192 next player`;
    case 'skip':
      return `${E.skip} ${who} skipped. Round ${roundNo || '\u2014'} \u2192 next player`;
    case 'refuse':
      return `${E.refuse} ${who} refused! Strike 1/3 (2 left before spectator).`;
    case 'timeout':
      return `${E.timer} ${who} didn't answer in time. Strike 2/3 \u00b7 round auto-skipped.`;
    case 'spectate':
      return `${E.spectate} ${who} is now a **SPECTATOR** for this session.`;
    case 'ended':
      return `${E.end} No active players left \u2014 session ended.`;
    default:
      return who;
  }
}

function roundFeedback({ action, user, roundNo, detail, iconURL } = {}) {
  const color =
    action === 'done' || action === 'skip' || action === 'ended'
      ? COLORS.active
      : COLORS.inactive;
  const title =
    action === 'ended'
      ? `${E.end} Session ended`
      : `${E.panel} Round ${roundNo || '\u2014'} \u2014 ${user || '\u2014'}`;
  return base(title, '', {
    color,
    description: defaultFeedbackText(action, user, roundNo, detail),
    iconURL,
  });
}

// ---------------------------------------------------------------------------
// 5 - End-of-session summary
// ---------------------------------------------------------------------------

function sessionEnded({ roundCount, startedAt, endedAt, intensity, players,
  strikers, bestStreak, iconURL } = {}) {
  const started = startedAt ? new Date(startedAt).toISOString().slice(0, 16).replace('T', ' ') : '\u2014';
  const ended = endedAt ? new Date(endedAt).toISOString().slice(0, 16).replace('T', ' ') : '\u2014';
  const lines = (players || [])
    .slice(0, 3)
    .map((p, i) => `${E.medal[i]} ${p.name} \u2014 ${p.turns} turns \u00b7 ${p.truths} truths \u00b7 ${p.dares} dares \u00b7 ${p.skips} skips`)
    .join('\n');
  const desc = [
    `**Session:** ${started} \u2192 ${ended}`,
    '',
    '**\u2014\u2014 Player stats \u2014\u2014**',
    lines,
    '',
    `Strikers: ${strikers || '\u2014'}`,
    `Intensity: ${intensityLabel(intensity)} \u00b7 Best streak: ${bestStreak ?? '6 clean turns'}`,
  ].join('\n');
  return base(`${E.panel} Session Ended \u00b7 ${roundCount || 0} rounds`, '', {
    color: COLORS.active,
    description: desc,
    iconURL,
  });
}

// ---------------------------------------------------------------------------
// 7 - Settings sub-panel
// ---------------------------------------------------------------------------

function settingsPanel({ settings, iconURL } = {}) {
  const s = settings || {};
  const fields = [
    { name: 'Intensity', value: intensityLabel(s.intensity), inline: true },
    { name: 'Categories', value: s.categories || 'Funny, Deep, Weird', inline: true },
    { name: 'Skip tokens', value: String(s.skip_tokens ?? 3), inline: true },
    { name: 'Strikes to kick', value: String(s.strikes_to_kick ?? 3), inline: true },
    { name: 'Max players', value: String(s.max_players ?? 20), inline: true },
    { name: 'Timers (s)', value: `join ${s.join_window_s ?? 60} \u00b7 turn ${s.turn_timer_s ?? 30} \u00b7 truth ${s.truth_timer_s ?? 120} \u00b7 dare ${s.dare_timer_s ?? 300}`, inline: false },
  ];
  return base(`${E.settings} Session default settings`, '', {
    color: COLORS.info,
    description: '_Changes apply to NEW sessions only._',
    fields,
    iconURL,
  });
}

// ---------------------------------------------------------------------------
// 8 - Prompt manager sub-panel
// ---------------------------------------------------------------------------

function promptManager({ truthsCustom, truthsBuiltIn, daresCustom, daresBuiltIn,
  lastAdded, iconURL } = {}) {
  const desc = [
    `**Truths:** ${truthsCustom ?? 0} custom \u00b7 ${truthsBuiltIn ?? 0} built-in`,
    `**Dares:** ${daresCustom ?? 0} custom \u00b7 ${daresBuiltIn ?? 0} built-in`,
    '',
    `**Last added:** ${lastAdded || '\u2014'}`,
  ].join('\n');
  return base(`${E.prompts} Custom prompts for this guild`, '', {
    color: COLORS.info,
    description: desc,
    iconURL,
  });
}

// ---------------------------------------------------------------------------
// 9 - Guild stats + 10 - History
// ---------------------------------------------------------------------------

function statsEmbed({ sessions, rounds, truths, dares, skips, refusals, top,
  iconURL } = {}) {
  const total = (truths ?? 0) + (dares ?? 0);
  const truthPct = total > 0 ? Math.round(((truths ?? 0) / total) * 100) : 0;
  const lines = (top || []).slice(0, 3).map((p, i) =>
    `${E.medal[i]} ${p.name} \u2014 ${p.rounds} rounds \u00b7 ${p.skips} skips \u00b7 ${p.strikes} strikes`
  ).join('\n');
  const desc = [
    `**Sessions:** ${sessions ?? 0}`,
    `**Rounds:** ${(rounds ?? 0).toLocaleString()}`,
    `**Truths:** ${truths ?? 0} (${truthPct}%) \u00b7 **Dares:** ${dares ?? 0} (${100 - truthPct}%)`,
    `**Skips:** ${skips ?? 0} \u00b7 **Refusals:** ${refusals ?? 0}`,
    '',
    '**\u2014\u2014 Top players \u2014\u2014**',
    lines,
  ].join('\n');
  return base(`${E.stats} All-time stats`, '', {
    color: COLORS.info,
    description: desc,
    iconURL,
  });
}

function historyEmbed({ items, page, pages, iconURL } = {}) {
  const lines = (items || [])
    .map((i) => `${i.when || '\u2014'}  ${i.channel || '\u2014'}  ${i.rounds == null ? '\u2014' : i.rounds + ' rounds'} \u00b7 ${i.duration || '0h 00m'} \u00b7 ${i.players ?? 0} players`)
    .join('\n');
  return base(`${E.history} Last 10 sessions`, '', {
    color: COLORS.info,
    description: lines || '\u2014',
    fields: [{ name: `Page ${page ?? 1}/${pages ?? 1}`, value: '\u200b' }],
    iconURL,
  });
}

// ---------------------------------------------------------------------------
// 6 - Empty / error states (ephemeral status embeds)
// ---------------------------------------------------------------------------

function notYourTurn(user, currentUser) {
  return base(`${E.timer} Hold on`, 'Not your turn', {
    color: COLORS.info,
    description: `It's not your turn, ${user || '\u2014'} \u2014 ${currentUser || '\u2014'} is choosing now.`,
  });
}

function sessionFull(count, maxPlayers) {
  return base(E.lock, 'Session full', {
    color: COLORS.inactive,
    description: `This session is full (${count || maxPlayers || 20}/${maxPlayers || 20}). Wait for the next one.`,
  });
}

function missingPermission() {
  return base(E.lock, 'Missing permission', {
    color: COLORS.inactive,
    description: 'I need **Manage Guild** to run session configuration.',
  });
}

function deletedPrompt() {
  return base(E.trash, 'Prompt removed', {
    color: COLORS.info,
    description: 'That prompt was removed \u2014 pick another.',
  });
}

function rejectedPrompt(reason) {
  return base(E.wrong, 'Prompt rejected', {
    color: COLORS.inactive,
    description: `Your prompt was rejected: ${reason || 'unknown'}`,
  });
}

function spicyLocked() {
  return base(E.spicy, 'Spicy pack locked', {
    color: COLORS.inactive,
    description: `The Spicy pack only unlocks at guild intensity **R** and can't be turned off for 24h. Confirm?`,
  });
}

module.exports = {
  COLORS,
  FOOTER,
  stamp,
  footerText,
  mainPanel,
  lobby,
  playerTurn,
  prompt,
  roundFeedback,
  sessionEnded,
  settingsPanel,
  promptManager,
  statsEmbed,
  historyEmbed,
  notYourTurn,
  sessionFull,
  missingPermission,
  deletedPrompt,
  rejectedPrompt,
  spicyLocked,
};