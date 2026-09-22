/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare module - panel.js (Phase 5: panel + interactions)
 *
 * The interaction layer for the whole ToD UI. Every customId follows the
 * approved contract (`tod:<area>:<action>:<ctx>` | `tod:<area>:select:<ctx>`
 * | `tod:<area>:modal:<ctx>`) and is parsed by parseCustomId().
 *
 * Responsibilities:
 *   - render payloads (embed + components) from store/embeds/ui
 *   - run the public session flow driven by the bot (lobby -> rounds ->
 *     prompt -> resolution -> next round -> ended), all timers through
 *     timers.js (the shared security scheduler)
 *   - keep the game API (game.js) as the single source of truth for state;
 *     this module never mutates rounds itself
 *   - handle() is the dispatcher wired from src/events/interactionCreate.js
 *
 * game.js returns no embeds (it stays discord-free); panel.js turns its
 * result objects into embeds/components using the mockup-compliant builders.
 */

'use strict';

const { EmbedBuilder, MessageFlags, ButtonStyle } = require('discord.js');

const pino = require('pino');
const log = pino({
  name: 'peace-tod',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'peace-tod', developedBy: 'Smith.Code' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const store = require('./store');
const session = require('./session');
const game = require('./game');
const timers = require('./timers');
const prompts = require('./prompts');
const embeds = require('./embeds');
const ui = require('./ui');
const { E } = require('./emojis');
const { checkProfanity } = require('../profanity');
const { get: settingsGet } = require('../settings');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };
const HISTORY_PAGE = 10;
const SETTINGS_PAGE = 5;
const SETTING_FIELD = {
  join_window: 'join_window_s',
  turn_timer: 'turn_timer_s',
  truth_timer: 'truth_timer_s',
  dare_timer: 'dare_timer_s',
  skip_tokens: 'skip_tokens',
  strikes_to_kick: 'strikes_to_kick',
  max_players: 'max_players',
};
const CATEGORY_MAP = { funny: 'Funny', deep: 'Deep', weird: 'Weird', spicy: 'Spicy' };

// ---------------------------------------------------------------------------
// id parsing
// ---------------------------------------------------------------------------

function parseCustomId(id) {
  const parts = String(id || '').split(':');
  const area = parts[1] || null;
  // settings selects embed the setting key as the ctx: tod:settings:select:<key>
  if (area === 'settings' && parts[2] === 'select') {
    return { raw: id, area, kind: 'select', setting: parts[3] || null };
  }
  const kind = parts[2] || null;
  return {
    raw: id,
    area,
    kind,
    ctx: parts[3] != null ? parts.slice(3).join(':') : null,
  };
}

// tod:round:truth:<gid>:<sid>:<uid> -> { guildId, sessionId, userId }
function ctxFrom(parsed) {
  if (!parsed.ctx) return {};
  const [guildId, sessionId, userId] = String(parsed.ctx).split(':');
  return {
    guildId: guildId || null,
    sessionId: sessionId ? Number(sessionId) : null,
    userId: userId || null,
  };
}

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------

function readSettings(json) {
  try {
    return JSON.parse(json || '{}') || {};
  } catch {
    return {};
  }
}

function guildConfig(guildId) {
  return store.getOrCreateGuildConfig(guildId);
}

function canManageGuild(interaction) {
  return Boolean(
    interaction.memberPermissions && interaction.memberPermissions.has('ManageGuild')
  );
}

function hasGuild(interaction) {
  return Boolean(interaction.guild);
}

async function tryReply(interaction, payload) {
  if (!interaction) return null;
  try {
    return await interaction.reply(payload);
  } catch {
    return null;
  }
}

async function tryUpdate(interaction, payload) {
  if (!interaction) return null;
  try {
    return await interaction.update(payload);
  } catch {
    return null;
  }
}

async function holdAck(interaction) {
  try {
    return await interaction.deferUpdate();
  } catch {
    return null;
  }
}

function botIcon(client) {
  return client && client.user ? client.user.displayAvatarURL({ dynamic: true }) : undefined;
}

async function channelFor(client, guild, channelId) {
  if (!client || !guild || !channelId) return null;
  try {
    if (guild.channels && guild.channels.cache) {
      const cached = guild.channels.cache.get(String(channelId));
      if (cached) return cached;
    }
    return await client.channels.fetch(channelId);
  } catch {
    return null;
  }
}

// Find our most recent lobby embed in the channel so re-renders edit it
// instead of stacking duplicates (the schema has no message-ref column).
async function postOrEditLobby(client, channel, payload) {
  if (!channel || !channel.send) return false;
  try {
    const msgs = await channel.messages.fetch({ limit: 10 });
    const mine = msgs.find(
      (m) =>
        m.author &&
        m.author.id === client.user.id &&
        m.embeds &&
        m.embeds[0] &&
        String(m.embeds[0].title || '').includes('Lobby')
    );
    if (mine) {
      await mine.edit(payload).catch(() => {});
      return true;
    }
  } catch {
    /* first post - fall through to a normal send */
  }
  await channel.send(payload).catch(() => {});
  return true;
}

function activeCount(sessionId) {
  return store.countActivePlayers(sessionId);
}

function settingsFor(sessionId) {
  const s = store.getSession(sessionId);
  return readSettings(s ? s.settings_json : '{}');
}

function lastRound(sessionId) {
  const rounds = store.listRounds(sessionId, 1000, 0);
  return rounds[rounds.length - 1] || null;
}

function orderLine(sessionId) {
  const players = store.listPlayers(sessionId).filter((p) => p.status === 'active');
  if (!players.length) return '';
  const n = players.length;
  return players.map((p, i) => `<@${p.user_id}> (${i + 1}/${n})`).join(' \u00b7 ');
}

function dateLabel(ms) {
  if (!ms) return '\u2014';
  return new Date(ms).toISOString().slice(5, 10);
}

function durLabel(startMs, endMs) {
  if (!startMs) return '0m';
  const mins = Math.max(0, Math.round(((endMs || Date.now()) - startMs) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// payload builders (pure - no discord client state)
// ---------------------------------------------------------------------------

function mainPanelPayload(guildId, iconURL) {
  const cfg = guildConfig(guildId);
  const st = store.guildStats(guildId);
  const longest = store.longestSession(guildId);
  return {
    embeds: [
      embeds.mainPanel({
        intensity: cfg.intensity,
        categories: cfg.categories,
        roundsPlayed: st.rounds,
        longestSession: longest || '\u2014',
        hasHistory: store.countSessions(guildId) > 0,
        iconURL,
      }),
    ],
    components: ui.mainPanelRow(),
  };
}

function settingsPayload(guildId, page = 0, iconURL) {
  const cfg = guildConfig(guildId);
  const keys = ui.DEFAULT_SETTING_KEYS;
  const pages = Math.ceil(keys.length / SETTINGS_PAGE);
  const safe = Math.max(0, Math.min(page, pages - 1));
  const slice = keys.slice(safe * SETTINGS_PAGE, safe * SETTINGS_PAGE + SETTINGS_PAGE);
  const rows = ui.settingsSelectRows(slice, cfg);
  if (safe > 0) {
    rows.push(ui.row(ui.btn('tod:settings:prev', '\u2039 Prev', ButtonStyle.Secondary)));
  }
  if (safe < pages - 1) {
    rows.push(ui.row(ui.btn('tod:settings:next', 'Next \u203a', ButtonStyle.Secondary)));
  }
  return {
    embeds: [embeds.settingsPanel({ settings: cfg, iconURL })],
    components: rows,
  };
}

function settingsApply(guildId, setting, values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { ok: false, reason: 'empty_selection' };
  }
  if (setting === 'intensity') {
    const v = String(values[0]).toLowerCase();
    if (!['pg', 'pg13', 'r'].includes(v)) return { ok: false, reason: 'bad_intensity' };
    store.updateGuildConfig(guildId, { intensity: v });
    return { ok: true };
  }
  if (setting === 'categories') {
    const picked = values.map(String);
    if (picked.includes('Spicy') && !store.getSpicyGate(guildId)) {
      return { ok: false, needSpicyConfirm: true };
    }
    store.updateGuildConfig(guildId, { categories: picked.join(',') });
    return { ok: true };
  }
  const field = SETTING_FIELD[setting];
  if (!field) return { ok: false, reason: 'unknown_setting' };
  const num = parseInt(String(values[0]), 10);
  if (!Number.isFinite(num) || num <= 0) return { ok: false, reason: 'bad_number' };
  store.updateGuildConfig(guildId, { [field]: num });
  return { ok: true };
}

function promptsPayload(guildId, iconURL) {
  const truthRows = store.listCustomPrompts(guildId, 'truth');
  const dareRows = store.listCustomPrompts(guildId, 'dare');
  const pack = prompts.getPackSummary();
  let truthsBuiltIn = 0;
  let daresBuiltIn = 0;
  for (const key of Object.keys(pack)) {
    truthsBuiltIn += pack[key].truth;
    daresBuiltIn += pack[key].dare;
  }
  const last = [...truthRows, ...dareRows].sort((a, b) => b.added_at - a.added_at)[0] || null;
  const lastAdded = last
    ? `"${last.prompt.length > 60 ? `${last.prompt.slice(0, 57)}...` : last.prompt}" (${last.kind === 'dare' ? 'Dare' : 'Truth'} \u00b7 ${last.category} \u00b7 ${last.intensity} \u00b7 by <@${last.added_by}>)`
    : null;
  const rows = [ui.promptManagerRow()];
  const deleteRow = ui.promptDeleteRow([...truthRows, ...dareRows]);
  if (deleteRow) rows.push(deleteRow);
  return {
    embeds: [
      embeds.promptManager({
        truthsCustom: truthRows.length,
        truthsBuiltIn,
        daresCustom: dareRows.length,
        daresBuiltIn,
        lastAdded,
        iconURL,
      }),
    ],
    components: rows,
  };
}

function statsPayload(guildId, iconURL) {
  const st = store.guildStats(guildId);
  const top = store
    .guildTopPlayers(guildId, 3)
    .map((p) => ({
      name: `<@${p.user_id}>`,
      rounds: Number(p.rounds) || 0,
      skips: Number(p.skips) || 0,
      strikes: Number(p.strikes) || 0,
    }));
  return {
    embeds: [
      embeds.statsEmbed({
        sessions: st.sessions,
        rounds: st.rounds,
        truths: st.truths,
        dares: st.dares,
        skips: st.skips,
        refusals: st.refusals,
        top,
        iconURL,
      }),
    ],
  };
}

function historyPayload(guildId, page = 1, iconURL) {
  const total = store.countSessions(guildId);
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE));
  const safe = Math.max(1, Math.min(page, pages));
  const rows = store.listSessions(guildId, HISTORY_PAGE, (safe - 1) * HISTORY_PAGE);
  const items = rows.map((s) => ({
    when: dateLabel(s.started_at),
    channel: `<#${s.channel_id}>`,
    rounds: s.round_count,
    duration: durLabel(s.started_at, s.ended_at),
    players: s.player_count,
  }));
  return {
    embeds: [embeds.historyEmbed({ items, page: safe, pages, iconURL })],
    components: [ui.historyRow()],
  };
}

function historyCsv(guildId) {
  const rows = store.listSessions(guildId, 1000, 0);
  const header = 'id,started_at,ended_at,status,round_count,players';
  const lines = rows.map((s) =>
    [
      s.id,
      new Date(s.started_at).toISOString(),
      s.ended_at ? new Date(s.ended_at).toISOString() : '',
      s.status,
      s.round_count,
      s.player_count,
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

function lobbyPayload(guild, sessionRow, iconURL) {
  const cfg = readSettings(sessionRow.settings_json);
  const players = store
    .listPlayers(sessionRow.id)
    .filter((p) => p.status !== 'left')
    .map((p) => `<@${p.user_id}>`);
  return {
    embeds: [
      embeds.lobby({
        hostMention: `<@${sessionRow.host_id}>`,
        channelMention: `<#${sessionRow.channel_id}>`,
        intensity: cfg.intensity,
        categories: cfg.categories,
        joinWindowS: cfg.join_window_s,
        turnTimerS: cfg.turn_timer_s,
        players,
        maxPlayers: cfg.max_players,
        iconURL,
      }),
    ],
    components: [ui.lobbyRow()],
  };
}

function channelPickPayload() {
  const pick = new EmbedBuilder()
    .setColor(embeds.COLORS.info)
    .setTitle(`${E.settings} Where should the session run?`)
    .setDescription('Pick a text channel \u2014 the lobby opens there.')
    .setFooter({ text: embeds.footerText() });
  return { embeds: [pick], components: [ui.channelRow()] };
}

// ---------------------------------------------------------------------------
// public poster helpers (bot-driven flow)
// ---------------------------------------------------------------------------

async function postLobby(client, guild, sessionRow, channel) {
  const payload = lobbyPayload(guild, sessionRow, botIcon(client));
  await postOrEditLobby(client, channel || (await channelFor(client, guild, sessionRow.channel_id)), payload);
}

function snapshotConfig(cfg) {
  return {
    intensity: cfg.intensity,
    categories: cfg.categories,
    join_window_s: cfg.join_window_s,
    turn_timer_s: cfg.turn_timer_s,
    truth_timer_s: cfg.truth_timer_s,
    dare_timer_s: cfg.dare_timer_s,
    skip_tokens: cfg.skip_tokens,
    strikes_to_kick: cfg.strikes_to_kick,
    max_players: cfg.max_players,
  };
}

async function startNewLobby(client, guild, channelId, hostId) {
  if (!guild) return null;
  const cfg = snapshotConfig(guildConfig(guild.id));
  const s = session.openLobby({ guildId: guild.id, channelId, hostId, config: cfg });
  await postLobby(client, guild, s, null);
  return s;
}

// Present + post the next player's turn, then arm the turn timer.
async function advanceToTurn(client, guild, sessionId) {
  const s = store.getSession(sessionId);
  if (!s || s.status !== 'active') {
    return postEnded(client, guild, sessionId);
  }
  let pending = game.peekPending(sessionId);
  if (pending) {
    const pl = store.listPlayers(sessionId).find((p) => p.user_id === pending.player.user_id);
    if (!pl || pl.status !== 'active') pending = null; // left/spectated since
  }
  let ownerId = pending ? pending.player.user_id : null;
  if (!ownerId) {
    const actives = store.listPlayers(sessionId).filter((p) => p.status === 'active');
    if (actives.length === 0) return postEnded(client, guild, sessionId);
    ownerId = actives[Math.floor(Math.random() * actives.length)].user_id;
  }
  let res;
  try {
    res = game.presentChoice(sessionId, ownerId);
  } catch {
    return postEnded(client, guild, sessionId);
  }
  if (!res || !res.roundId) return postEnded(client, guild, sessionId);

  const current = game.currentUser(sessionId) || ownerId;
  const cfg = settingsFor(sessionId);
  const channel = await channelFor(client, guild, s.channel_id);
  const embed = embeds.playerTurn({
    roundNo: res.roundNo,
    currentUser: `<@${current}>`,
    orderLine: orderLine(sessionId),
    turnTimerS: cfg.turn_timer_s,
  });
  if (channel) {
    await channel
      .send({ embeds: [embed], components: [ui.roundRow({ guildId: s.guild_id, sessionId, userId: current })] })
      .catch(() => {});
  }
  timers.cancelTurnTimer(sessionId);
  timers.startTurnTimer(sessionId, () => onTurnTimeout(client, guild, sessionId));
}

// Post the served prompt + answer row, then arm the answer timer.
async function postPrompt(client, guild, sessionId, prompt, kind) {
  const s = store.getSession(sessionId);
  const cfg = settingsFor(sessionId);
  const last = lastRound(sessionId);
  const category = (last && last.category) || '';
  const timerLabel = kind === 'dare'
    ? `${cfg.dare_timer_s || 300} seconds`
    : `${cfg.truth_timer_s || 120} seconds`;
  const current = game.currentUser(sessionId);
  timers.cancelTurnTimer(sessionId);
  timers.cancelAnswerTimer(sessionId);
  const channel = await channelFor(client, guild, s.channel_id);
  const embed = embeds.prompt({
    kind,
    category,
    intensity: (prompt && prompt.intensity) || cfg.intensity,
    text: prompt && prompt.text,
    answerUser: current ? `<@${current}>` : undefined,
    timerLabel,
  });
  if (channel) {
    await channel
      .send({ embeds: [embed], components: [ui.promptRow({ guildId: s.guild_id, sessionId, userId: current })] })
      .catch(() => {});
  }
  timers.startAnswerTimer(sessionId, () => onAnswerTimeout(client, guild, sessionId));
}

// Post feedback, then either finish (ended) or draw the next turn.
async function postResolution(client, guild, sessionId, action, res) {
  const s = store.getSession(sessionId);
  const last = lastRound(sessionId);
  const roundNo = last ? last.round_no : null;
  const offender = last ? last.user_id : null;

  if (res && res.ended) {
    timers.cancelTimers(sessionId);
    return postEnded(client, guild, sessionId);
  }
  timers.cancelTimers(sessionId);

  const channel = await channelFor(client, guild, s.channel_id);
  if (channel) {
    await channel
      .send({ embeds: [embeds.roundFeedback({ action, user: offender ? `<@${offender}>` : undefined, roundNo })] })
      .catch(() => {});
    if (res && res.spectated) {
      await channel
        .send({ embeds: [embeds.roundFeedback({ action: 'spectate', user: offender ? `<@${offender}>` : undefined })] })
        .catch(() => {});
    }
  }
  await advanceToTurn(client, guild, sessionId);
}

async function onTurnTimeout(client, guild, sessionId) {
  const s = store.getSession(sessionId);
  if (!s || s.status !== 'active') return;
  let res;
  try {
    res = game.handleTimeout(sessionId);
  } catch {
    return;
  }
  await postResolution(client, guild, sessionId, 'timeout', res);
}

async function onAnswerTimeout(client, guild, sessionId) {
  return onTurnTimeout(client, guild, sessionId);
}

async function postEnded(client, guild, sessionId) {
  const s = store.getSession(sessionId);
  if (!s) return;
  const cfg = settingsFor(sessionId);
  let summary = {};
  try {
    summary = JSON.parse(s.summary_json || '{}') || {};
  } catch {
    summary = {};
  }
  const list = summary.players || [];
  const players = list
    .sort((a, b) => b.turns - a.turns)
    .map((p) => ({
      name: `<@${p.user_id}>`,
      turns: p.turns,
      truths: p.truths,
      dares: p.dares,
      skips: p.skips_used,
    }));
  const strikers = list.filter((p) => p.strikes > 0);
  const channel = await channelFor(client, guild, s.channel_id);
  const embed = embeds.sessionEnded({
    roundCount: store.listRounds(sessionId, 1000, 0).length,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    intensity: cfg.intensity,
    players,
    strikers: strikers.length ? strikers.map((x) => `<@${x.user_id}>`).join(', ') : null,
    bestStreak: 6,
  });
  if (channel) {
    await channel.send({ embeds: [embed], components: [ui.endRow()] }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// interaction handlers
// ---------------------------------------------------------------------------

async function handlePanelStart(interaction) {
  if (!canManageGuild(interaction)) {
    return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
  }
  return tryReply(interaction, { ...channelPickPayload(), ...EPHEMERAL });
}

async function handlePanelChannelSelect(interaction) {
  if (!canManageGuild(interaction)) {
    return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
  }
  const channelId = interaction.values && interaction.values[0];
  if (!channelId) return holdAck(interaction);
  const s = await startNewLobby(interaction.client, interaction.guild, channelId, interaction.user.id);
  if (!s) return holdAck(interaction);
  return tryReply(interaction, {
    embeds: [embeds.roundFeedback({ action: 'done', detail: `${E.done} Lobby opened in <#${channelId}> \u2014 press **Start Now** when ready.` })],
    ...EPHEMERAL,
  });
}

async function handleLobbyJoin(interaction) {
  const s = store.findOpenSession(interaction.channel.id);
  if (!s) return holdAck(interaction);
  const cfg = settingsFor(s.id);
  const existing = store.listPlayers(s.id).find((p) => p.user_id === interaction.user.id);
  const maxPlayers = cfg.max_players || 20;
  if (!existing && activeCount(s.id) >= maxPlayers) {
    return tryReply(interaction, {
      embeds: [embeds.sessionFull(activeCount(s.id), maxPlayers)],
      ...EPHEMERAL,
    });
  }
  session.join(s.id, interaction.user.id);
  await postLobby(interaction.client, interaction.guild, s, null);
  return tryReply(interaction, {
    embeds: [embeds.roundFeedback({ action: 'done', user: `<@${interaction.user.id}>`, detail: `${E.done} You're in \u2014 press **Start Now** when ready.` })],
    ...EPHEMERAL,
  });
}

async function handleLobbyStart(interaction) {
  const s = store.findOpenSession(interaction.channel.id);
  if (!s) return holdAck(interaction);
  if (s.status === 'active') return holdAck(interaction);
  if (s.host_id !== interaction.user.id) {
    return tryReply(interaction, {
      embeds: [embeds.roundFeedback({ action: 'refuse', user: `<@${interaction.user.id}>`, detail: `${E.lock} Only the host can start this session.` })],
      ...EPHEMERAL,
    });
  }
  session.start(s.id);
  timers.cancelTimers(s.id);
  await advanceToTurn(interaction.client, interaction.guild, s.id);
  return tryReply(interaction, {
    embeds: [embeds.roundFeedback({ action: 'done', detail: `${E.start} Session started! Round 1 begins below.` })],
    ...EPHEMERAL,
  });
}

async function handleLobbyLeave(interaction) {
  const s = store.findOpenSession(interaction.channel.id);
  if (!s) return holdAck(interaction);
  session.leave(s.id, interaction.user.id);
  await postLobby(interaction.client, interaction.guild, s, null);
  return tryReply(interaction, {
    embeds: [embeds.roundFeedback({ action: 'done', user: `<@${interaction.user.id}>`, detail: `${E.leave} You left this session.` })],
    ...EPHEMERAL,
  });
}

// Resolve the ctx of a tod:round:* / tod:answer:* button, validate that the
// presser is the intended player, and that it's their turn.
function turnContext(interaction, parsed) {
  const ctx = ctxFrom(parsed);
  if (!ctx.sessionId || !ctx.userId || !ctx.guildId) return null;
  if (interaction.guild && interaction.guild.id !== ctx.guildId) return null;
  if (interaction.user.id !== ctx.userId) return null;
  if (game.currentUser(ctx.sessionId) !== ctx.userId) return null;
  const s = store.getSession(ctx.sessionId);
  if (!s || s.status !== 'active') return null;
  return ctx;
}

async function handleRoundChoice(interaction, parsed) {
  const ctx = turnContext(interaction, parsed);
  if (!ctx) {
    const current = parsed.ctx ? ctxFrom(parsed).userId : undefined;
    return tryReply(interaction, {
      embeds: [embeds.notYourTurn(`<@${interaction.user.id}>`, current ? `<@${current}>` : undefined)],
      ...EPHEMERAL,
    });
  }
  const kind = parsed.kind; // truth | dare | skip

  if (kind === 'truth' || kind === 'dare') {
    const p = game.resolveChoice(ctx.sessionId, kind);
    if (!p) {
      return tryReply(interaction, {
        embeds: [embeds.rejectedPrompt('Pool is empty \u2014 enable more categories or add prompts.')],
        ...EPHEMERAL,
      });
    }
    await postPrompt(interaction.client, interaction.guild, ctx.sessionId, p, kind);
    return tryReply(interaction, {
      embeds: [embeds.roundFeedback({ action: 'done', user: `<@${ctx.userId}>`, detail: `${E.panel} ${kind === 'dare' ? 'Dare' : 'Truth'} posted below \u2014 answer within the timer.` })],
      ...EPHEMERAL,
    });
  }

  // turn-menu skip (strike-free, spends a token)
  const res = game.skipTurn(ctx.sessionId, ctx.userId);
  if (!res.ok) {
    return tryReply(interaction, {
      embeds: [embeds.roundFeedback({ action: 'skip', user: `<@${ctx.userId}>`, detail: `${E.skip} You're out of skips for this session.` })],
      ...EPHEMERAL,
    });
  }
  await postResolution(interaction.client, interaction.guild, ctx.sessionId, 'skip', res);
  return holdAck(interaction);
}

async function handleAnswerAction(interaction, parsed) {
  const ctx = turnContext(interaction, parsed);
  if (!ctx) {
    return tryReply(interaction, {
      embeds: [embeds.notYourTurn(`<@${interaction.user.id}>`)],
      ...EPHEMERAL,
    });
  }
  const kind = parsed.kind; // done | skip | refuse

  if (kind === 'done') {
    const res = game.markDone(ctx.sessionId, ctx.userId);
    await postResolution(interaction.client, interaction.guild, ctx.sessionId, 'done', res);
    return holdAck(interaction);
  }

  if (kind === 'skip') {
    const res = game.useSkip(ctx.sessionId, ctx.userId);
    if (!res.ok) {
      return tryReply(interaction, {
        embeds: [embeds.roundFeedback({ action: 'skip', user: `<@${ctx.userId}>`, detail: `${E.skip} You're out of skips for this session.` })],
        ...EPHEMERAL,
      });
    }
    await postPrompt(interaction.client, interaction.guild, ctx.sessionId, res.prompt, res.prompt && res.prompt.kind);
    return tryReply(interaction, {
      embeds: [embeds.roundFeedback({ action: 'skip', user: `<@${ctx.userId}>`, detail: `${E.skip} New prompt below \u2014 answer within the timer.` })],
      ...EPHEMERAL,
    });
  }

  if (kind === 'refuse') {
    const res = game.refuse(ctx.sessionId, ctx.userId);
    await postResolution(interaction.client, interaction.guild, ctx.sessionId, 'refuse', res);
    return holdAck(interaction);
  }

  return holdAck(interaction);
}

async function handleSettingsSelect(interaction, parsed) {
  const guildId = interaction.guild.id;
  const res = settingsApply(guildId, parsed.setting, interaction.values);
  if (res.needSpicyConfirm) {
    return tryReply(interaction, {
      embeds: [embeds.spicyLocked()],
      components: [ui.spicyConfirmRow()],
      ...EPHEMERAL,
    });
  }
  const payload = settingsPayload(guildId, 0, botIcon(interaction.client));
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ ...payload }).catch(() => {});
  } else {
    await tryUpdate(interaction, payload);
  }
  return true;
}

async function handleSpicyEnable(interaction) {
  const guildId = interaction.guild.id;
  const cfg = guildConfig(guildId);
  if (cfg.intensity !== 'r') {
    return tryReply(interaction, {
      embeds: [embeds.rejectedPrompt('The Spicy pack only unlocks at guild intensity **R**.')],
      ...EPHEMERAL,
    });
  }
  store.touchSpicy(guildId);
  return tryReply(interaction, {
    embeds: [embeds.roundFeedback({ action: 'done', detail: `${E.spicy} Spicy pack enabled \u2014 toggle the **Spicy** category to start serving it.` })],
    ...EPHEMERAL,
  });
}

async function handlePromptsModal(interaction, parsed) {
  const kind = parsed.ctx === 'dare' ? 'dare' : 'truth';
  const text = (interaction.fields.getTextInputValue('prompt_text') || '').trim();
  const categoryRaw = interaction.fields.getTextInputValue('prompt_category') || '';
  const intensityRaw = interaction.fields.getTextInputValue('prompt_intensity') || '';
  const category = CATEGORY_MAP[String(categoryRaw).trim().toLowerCase()];
  const intensity = String(intensityRaw).trim().toLowerCase();

  let reason = null;
  if (!text) reason = 'empty text';
  else if (text.length > 200) reason = 'too long (>200)';
  else if (!category) reason = 'category must be Funny, Deep, Weird or Spicy';
  else if (!['pg', 'pg13', 'r'].includes(intensity)) reason = 'intensity must be pg, pg13 or r';

  if (!reason && text.length <= 200) {
    const words = (settingsGet(interaction.guild.id, 'security') || {}).words || [];
    if (checkProfanity(text, words)) reason = 'profanity';
  }

  if (!reason) {
    const existing = store
      .listCustomPrompts(interaction.guild.id, kind)
      .some((p) => p.prompt.toLowerCase() === text.toLowerCase());
    if (existing) reason = 'duplicate';
  }

  if (reason) {
    return tryReply(interaction, { embeds: [embeds.rejectedPrompt(reason)], ...EPHEMERAL });
  }

  const res = store.addCustomPrompt({
    guildId: interaction.guild.id,
    kind,
    category,
    intensity,
    prompt: text,
    addedBy: interaction.user.id,
  });
  if (!res.ok) {
    return tryReply(interaction, { embeds: [embeds.rejectedPrompt('duplicate')], ...EPHEMERAL });
  }
  return tryReply(interaction, {
    embeds: [embeds.roundFeedback({ action: 'done', detail: `${E.done} ${kind === 'dare' ? 'Dare' : 'Truth'} saved: "${text.length > 80 ? `${text.slice(0, 77)}...` : text}"` })],
    ...EPHEMERAL,
  });
}

async function handlePromptsDeleteSelect(interaction) {
  const id = Number(interaction.values && interaction.values[0]);
  if (!Number.isInteger(id) || id <= 0) return holdAck(interaction);
  const all = [...store.listCustomPrompts(interaction.guild.id, 'truth'), ...store.listCustomPrompts(interaction.guild.id, 'dare')];
  const row = all.find((p) => p.id === id);
  if (!row) {
    return tryReply(interaction, { embeds: [embeds.deletedPrompt()], ...EPHEMERAL });
  }
  store.deleteCustomPrompt(id, interaction.guild.id, row.added_by);
  const payload = promptsPayload(interaction.guild.id, botIcon(interaction.client));
  return tryReply(interaction, {
    embeds: [embeds.deletedPrompt()],
    components: payload.components,
    ...EPHEMERAL,
  });
}

// ---------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------

async function handleButton(interaction, parsed) {
  switch (parsed.area) {
    case 'panel':
      if (parsed.kind === 'start') return handlePanelStart(interaction);
      if (parsed.kind === 'settings') {
        if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
        return tryReply(interaction, { ...settingsPayload(interaction.guild.id, 0, botIcon(interaction.client)), ...EPHEMERAL });
      }
      if (parsed.kind === 'prompts') {
        if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
        return tryReply(interaction, { ...promptsPayload(interaction.guild.id, botIcon(interaction.client)), ...EPHEMERAL });
      }
      if (parsed.kind === 'stats') {
        return tryReply(interaction, { ...statsPayload(interaction.guild.id, botIcon(interaction.client)), ...EPHEMERAL });
      }
      if (parsed.kind === 'history') {
        return tryReply(interaction, { ...historyPayload(interaction.guild.id, 1, botIcon(interaction.client)), ...EPHEMERAL });
      }
      return holdAck(interaction);

    case 'lobby':
      if (parsed.kind === 'join') return handleLobbyJoin(interaction);
      if (parsed.kind === 'start') return handleLobbyStart(interaction);
      if (parsed.kind === 'leave') return handleLobbyLeave(interaction);
      return holdAck(interaction);

    case 'round':
      return handleRoundChoice(interaction, parsed);

    case 'answer':
      return handleAnswerAction(interaction, parsed);

    case 'end':
      if (parsed.kind === 'again') {
        const s = await startNewLobby(interaction.client, interaction.guild, interaction.channel.id, interaction.user.id);
        if (!s) return holdAck(interaction);
        return tryReply(interaction, {
          embeds: [embeds.roundFeedback({ action: 'done', detail: `${E.playAgain} New lobby opened in <#${interaction.channel.id}>!` })],
          ...EPHEMERAL,
        });
      }
      if (parsed.kind === 'log') {
        return tryReply(interaction, { ...historyPayload(interaction.guild.id, 1, botIcon(interaction.client)), ...EPHEMERAL });
      }
      return holdAck(interaction);

    case 'settings':
      if (parsed.kind === 'prev' || parsed.kind === 'next') {
        if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
        const delta = parsed.kind === 'next' ? 1 : -1;
        return tryUpdate(interaction, settingsPayload(interaction.guild.id, delta, botIcon(interaction.client)));
      }
      return holdAck(interaction);

    case 'prompts':
      if (parsed.kind === 'add') {
        if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
        return interaction.showModal(ui.addPromptModal(parsed.ctx === 'dare' ? 'dare' : 'truth')).catch(() => {});
      }
      if (parsed.kind === 'list') {
        if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
        return tryReply(interaction, { ...promptsPayload(interaction.guild.id, botIcon(interaction.client)), ...EPHEMERAL });
      }
      if (parsed.kind === 'delete') {
        if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
        return tryReply(interaction, { ...promptsPayload(interaction.guild.id, botIcon(interaction.client)), ...EPHEMERAL });
      }
      if (parsed.kind === 'reload') {
        if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
        return tryReply(interaction, { ...promptsPayload(interaction.guild.id, botIcon(interaction.client)), ...EPHEMERAL });
      }
      return holdAck(interaction);

    case 'history':
      if (parsed.kind === 'prev' || parsed.kind === 'next') {
        const total = store.countSessions(interaction.guild.id);
        const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE));
        const delta = parsed.kind === 'next' ? 1 : -1;
        return tryUpdate(interaction, historyPayload(interaction.guild.id, 1 + delta, botIcon(interaction.client)));
      }
      if (parsed.kind === 'export') {
        const csv = historyCsv(interaction.guild.id);
        return interaction
          .reply({
            content: '**ToD history export**',
            files: [{ name: 'tod_history.csv', attachment: Buffer.from(csv, 'utf8') }],
            ...EPHEMERAL,
          })
          .catch(() => {});
      }
      return holdAck(interaction);

    case 'spicy':
      if (parsed.kind === 'enable') return handleSpicyEnable(interaction);
      if (parsed.kind === 'cancel') {
        return tryReply(interaction, {
          embeds: [embeds.roundFeedback({ action: 'done', detail: `Okay \u2014 Spicy stays ${E.lock} locked.` })],
          ...EPHEMERAL,
        });
      }
      return holdAck(interaction);

    default:
      log.warn({ customId: parsed.raw }, 'tod unhandled button');
      return holdAck(interaction);
  }
}

async function handleSelectMenu(interaction, parsed) {
  if (parsed.area === 'settings' && parsed.kind === 'select') {
    if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
    return handleSettingsSelect(interaction, parsed);
  }
  if (parsed.area === 'prompts' && parsed.kind === 'select' && parsed.ctx === 'delete') {
    if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
    return handlePromptsDeleteSelect(interaction);
  }
  log.warn({ customId: parsed.raw }, 'tod unhandled select');
  return holdAck(interaction);
}

async function handleChord(interaction, parsed) {
  if (parsed.area === 'panel' && parsed.kind === 'select' && parsed.ctx === 'channel') {
    return handlePanelChannelSelect(interaction);
  }
  log.warn({ customId: parsed.raw }, 'tod unhandled channel select');
  return holdAck(interaction);
}

async function handleModal(interaction, parsed) {
  if (parsed.area === 'prompts' && parsed.kind === 'modal') {
    if (!canManageGuild(interaction)) return tryReply(interaction, { embeds: [embeds.missingPermission()], ...EPHEMERAL });
    return handlePromptsModal(interaction, parsed);
  }
  log.warn({ customId: parsed.raw }, 'tod unhandled modal');
  return holdAck(interaction);
}

async function handle(interaction) {
  const raw = interaction && interaction.customId;
  if (typeof raw !== 'string' || !raw.startsWith('tod:')) return false;
  if (!hasGuild(interaction)) {
    await holdAck(interaction);
    return true;
  }
  const parsed = parseCustomId(raw);
  try {
    if (interaction.isModalSubmit()) return await handleModal(interaction, parsed);
    if (interaction.isChannelSelectMenu()) return await handleChord(interaction, parsed);
    if (interaction.isStringSelectMenu()) return await handleSelectMenu(interaction, parsed);
    if (interaction.isButton()) return await handleButton(interaction, parsed);
    return await holdAck(interaction);
  } catch (err) {
    log.warn({ customId: raw, err: err.message }, 'tod panel error');
    await interaction
      .reply({
        embeds: [embeds.roundFeedback({ action: 'refuse', detail: 'Something went wrong \u2014 try again.' })],
        ...EPHEMERAL,
      })
      .catch(() => {});
    return true;
  }
}

module.exports = {
  parseCustomId,
  ctxFrom,
  readSettings,
  mainPanelPayload,
  settingsPayload,
  settingsApply,
  promptsPayload,
  statsPayload,
  historyPayload,
  historyCsv,
  lobbyPayload,
  advanceToTurn,
  postResolution,
  postEnded,
  handle,
};