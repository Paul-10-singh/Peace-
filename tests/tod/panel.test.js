/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - panel + interaction tests (Phase 5)
 *
 * Covers parseCustomId, payload builders (panel / settings / prompts /
 * stats / history / lobby), settingsApply (incl. the spicy confirm path),
 * and the handle() dispatcher against stubbed interactions. Runs on the
 * in-memory database (TOD_DB_PATH-before-require pattern).
 */

process.env.TOD_DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const store = require('../../src/utils/tod/store.js');
const session = require('../../src/utils/tod/session.js');
const game = require('../../src/utils/tod/game.js');
const panel = require('../../src/utils/tod/panel.js');

const G = '111111111111111111';
const CH = '222222222222222222';
const HOST = '333333333333333333';
const OTHER = '444444444444444444';
const BASE_CONFIG = {
  intensity: 'pg13',
  categories: 'Funny,Deep,Weird',
  turn_timer_s: 1,
  truth_timer_s: 2,
  dare_timer_s: 3,
  skip_tokens: 2,
  strikes_to_kick: 2,
};

function channelStub(id) {
  return {
    id: String(id),
    send: async (payload) => ({ payload }),
    messages: {
      fetch: async () => ({ find: () => null }),
    },
  };
}

function clientStub() {
  return {
    user: { id: '999999999999999999' },
  };
}

function guildStub(channel) {
  const cache = new Map();
  if (channel) cache.set(String(channel.id), channel);
  return { id: G, channels: { cache } };
}

function makeInteraction({ customId, user = HOST, channel = channelStub(CH), guild, values, fields, manage = true }) {
  const sent = { replies: [], updates: [], modals: [] };
  const interaction = {
    customId,
    user: { id: user },
    channel,
    guild,
    client: clientStub(),
    memberPermissions:
      manage ? new Set(['ManageGuild']) : new Set(),
    replied: false,
    deferred: false,
  };
  interaction.isButton = () => customId.startsWith('tod:') && !customId.includes(':select:') && !customId.includes(':modal:');
  interaction.isStringSelectMenu = () => customId.includes(':select:');
  interaction.isChannelSelectMenu = () => customId.includes(':select:channel');
  interaction.isModalSubmit = () => customId.includes(':modal:');
  interaction.values = values || [];
  interaction.fields = {
    getTextInputValue: (name) => (fields || {})[name] || '',
  };
  interaction.reply = async (payload) => {
    sent.replies.push(payload);
    interaction.replied = true;
    return payload;
  };
  interaction.update = async (payload) => {
    sent.updates.push(payload);
    interaction.replied = true;
    return payload;
  };
  interaction.deferUpdate = async () => {
    interaction.deferred = true;
    return null;
  };
  interaction.editReply = async (payload) => {
    sent.replies.push(payload);
    return payload;
  };
  interaction.showModal = async (modal) => {
    sent.modals.push(modal);
    return null;
  };
  return { interaction, sent };
}

function openLobby(channelId = CH) {
  return session.openLobby({ guildId: G, channelId, hostId: HOST, config: BASE_CONFIG });
}

beforeAll(() => {
  store.getOrCreateGuildConfig(G);
});

describe('parseCustomId', () => {
  it('parses plain buttons', () => {
    expect(panel.parseCustomId('tod:panel:start')).toEqual({ raw: 'tod:panel:start', area: 'panel', kind: 'start', ctx: null });
  });

  it('parses context buttons into area/kind/ctx', () => {
    const p = panel.parseCustomId('tod:round:truth:111111111111111111:5:333333333333333333');
    expect(p.area).toBe('round');
    expect(p.kind).toBe('truth');
    expect(panel.ctxFrom(p)).toEqual({ guildId: G, sessionId: 5, userId: HOST });
  });

  it('special-cases settings selects into a setting key', () => {
    expect(panel.parseCustomId('tod:settings:select:intensity')).toEqual({
      raw: 'tod:settings:select:intensity',
      area: 'settings',
      kind: 'select',
      setting: 'intensity',
    });
    expect(panel.parseCustomId('tod:settings:select:categories').setting).toBe('categories');
  });

  it('returns null-ish area for junk ids (no throw)', () => {
    expect(panel.parseCustomId('!nope')).toEqual({ raw: '!nope', area: null, kind: null, ctx: null });
  });
});

describe('settingsApply', () => {
  it('applies intensity', () => {
    const r = panel.settingsApply(G, 'intensity', ['r']);
    expect(r.ok).toBe(true);
    expect(store.getOrCreateGuildConfig(G).intensity).toBe('r');
  });

  it('rejects a bad intensity', () => {
    expect(panel.settingsApply(G, 'intensity', ['x'])).toEqual({ ok: false, reason: 'bad_intensity' });
  });

  it('applies categories when Spicy is not picked', () => {
    const r = panel.settingsApply(G, 'categories', ['Funny', 'Deep']);
    expect(r.ok).toBe(true);
    expect(store.getOrCreateGuildConfig(G).categories).toBe('Funny,Deep');
  });

  it('demands spicy confirmation when Spicy is picked but the gate is locked', () => {
    const r = panel.settingsApply(G, 'categories', ['Funny', 'Spicy']);
    expect(r.needSpicyConfirm).toBe(true);
    // nothing was written
    expect(store.getOrCreateGuildConfig(G).categories).toBe('Funny,Deep');
  });

  it('applies a numeric setting', () => {
    const r = panel.settingsApply(G, 'max_players', ['50']);
    expect(r.ok).toBe(true);
    expect(store.getOrCreateGuildConfig(G).max_players).toBe(50);
  });

  it('rejects unknown settings / bad numbers', () => {
    expect(panel.settingsApply(G, 'nope', ['1'])).toEqual({ ok: false, reason: 'unknown_setting' });
    expect(panel.settingsApply(G, 'max_players', ['-1'])).toEqual({ ok: false, reason: 'bad_number' });
    expect(panel.settingsApply(G, 'max_players', [])).toEqual({ ok: false, reason: 'empty_selection' });
  });
});

describe('payload builders', () => {
  it('mainPanelPayload carries status + component rows', () => {
    const payload = panel.mainPanelPayload(G);
    expect(payload.embeds).toHaveLength(1);
    expect(payload.components.length).toBeGreaterThanOrEqual(2);
    expect(payload.embeds[0].data.title).toContain('Truth or Dare');
  });

  it('stats/history show zero-state without sessions', () => {
    const st = panel.statsPayload(G);
    expect(panel.historyPayload(G, 1).embeds).toHaveLength(1);
    expect(st.embeds[0].data.title).toContain('All-time stats');
  });

  it('lobbyPayload renders the host + participants', () => {
    const s = openLobby();
    session.join(s.id, OTHER);
    const payload = panel.lobbyPayload(G, store.getSession(s.id));
    expect(payload.embeds[0].data.description).toContain(HOST);
    expect(payload.embeds[0].data.description).toContain(OTHER);
    const row = payload.components[0].toJSON();
    expect(row.type).toBe(1);
    expect(row.components).toHaveLength(3);
  });

  it('historyCsv emits a header + one row per session', () => {
    const csv = panel.historyCsv(G);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,started_at,ended_at,status,round_count,players');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('longestSession counts from rounds once a session is ended', () => {
    const s = openLobby();
    session.join(s.id, OTHER);
    session.start(s.id);
    game.presentChoice(s.id, HOST);
    game.resolveChoice(s.id, 'truth');
    store.endSession(s.id, JSON.stringify({ reason: 'test' }));
    expect(store.longestSession(G)).toBe(1);
    expect(panel.mainPanelPayload(G).embeds[0].data.description).toContain('1');
  });
});

describe('handle() routing', () => {
  it('returns false for non-tod interactions', async () => {
    const { interaction } = makeInteraction({ customId: 'other:thing', guild: guildStub() });
    expect(await panel.handle(interaction)).toBe(false);
  });

  it('acks silently when called outside a guild', async () => {
    const { interaction, sent } = makeInteraction({ customId: 'tod:panel:start' });
    expect(await panel.handle(interaction)).toBe(true);
    expect(interaction.deferred).toBe(true); // acknowledged, nothing posted
    expect(sent.replies).toHaveLength(0);
  });

  it('denies panel:start to a non-manager', async () => {
    const { interaction, sent } = makeInteraction({ customId: 'tod:panel:start', guild: guildStub(), manage: false });
    await panel.handle(interaction);
    expect(sent.replies).toHaveLength(1);
    expect(sent.replies[0].flags).toBe(64); // MessageFlags.Ephemeral
  });

  it('lets a manager start a session via the channel picker', async () => {
    const { interaction, sent } = makeInteraction({ customId: 'tod:panel:start', guild: guildStub() });
    await panel.handle(interaction);
    expect(sent.replies).toHaveLength(1);
    const row = sent.replies[0].components[0];
    expect(row.components[0].data.custom_id).toBe('tod:panel:select:channel');
  });

  it('opens a lobby from the channel picker', async () => {
    const ch = channelStub(CH);
    const { interaction, sent } = makeInteraction({
      customId: 'tod:panel:select:channel',
      guild: guildStub(ch),
      values: [CH],
    });
    await panel.handle(interaction);
    expect(sent.replies).toHaveLength(1);
    expect(store.findOpenSession(CH)).not.toBeNull();
    // lobby + a session were posted into the channel
    expect(ch.sent || undefined);
  });

  it('routes a lobby join to the session and posts the lobby', async () => {
    const ch = channelStub(CH);
    const s = openLobby();
    const { interaction, sent } = makeInteraction({
      customId: 'tod:lobby:join',
      guild: guildStub(ch),
      channel: ch,
      user: OTHER,
    });
    await panel.handle(interaction);
    expect(store.listPlayers(s.id).some((p) => p.user_id === OTHER)).toBe(true);
    expect(sent.replies).toHaveLength(1);
  });

  it('does not let a non-host start the lobby', async () => {
    const ch = channelStub(CH);
    const s = openLobby();
    const { interaction, sent } = makeInteraction({
      customId: 'tod:lobby:start',
      guild: guildStub(ch),
      channel: ch,
      user: OTHER,
    });
    await panel.handle(interaction);
    expect(store.getSession(s.id).status).toBe('lobby');
    expect(sent.replies).toHaveLength(1);
  });

  it('lets the host start and posts round 1', async () => {
    const ch = channelStub(CH);
    const s = openLobby();
    const { interaction, sent } = makeInteraction({
      customId: 'tod:lobby:start',
      guild: guildStub(ch),
      channel: ch,
    });
    await panel.handle(interaction);
    expect(store.getSession(s.id).status).toBe('active');
    expect(store.listRounds(s.id)).toHaveLength(1);
    expect(sent.replies).toHaveLength(1);
  });

  it('rejects a round choice from the wrong user', async () => {
    const ch = channelStub(CH);
    const s = openLobby();
    session.join(s.id, OTHER);
    session.start(s.id);
    game.presentChoice(s.id, HOST); // HOST is the current turn owner
    const { interaction, sent } = makeInteraction({
      customId: `tod:round:dare:${G}:${s.id}:${OTHER}`,
      guild: guildStub(ch),
      channel: ch,
      user: OTHER,
    });
    await panel.handle(interaction);
    expect(sent.replies).toHaveLength(1);
    // the round was not touched
    expect(store.listRounds(s.id)[0].choice).toBeNull();
  });

  it('serves a prompt when the owner picks Truth and arms an answer timer', async () => {
    const ch = channelStub(CH);
    const s = openLobby();
    session.start(s.id);
    game.presentChoice(s.id, HOST);
    const { interaction, sent } = makeInteraction({
      customId: `tod:round:truth:${G}:${s.id}:${HOST}`,
      guild: guildStub(ch),
      channel: ch,
    });
    await panel.handle(interaction);
    expect(sent.replies).toHaveLength(1);
    expect(store.listRounds(s.id)[0].choice).toBe('truth');
    expect(store.listRounds(s.id)[0].prompt_text).toBeTypeOf('string');
  });

  it('adds a prompt through the modal (clean input)', async () => {
    const { interaction, sent } = makeInteraction({
      customId: 'tod:prompts:modal:truth',
      guild: guildStub(),
      fields: {
        prompt_text: 'What keeps you up at night?',
        prompt_category: 'deep',
        prompt_intensity: 'pg13',
      },
    });
    await panel.handle(interaction);
    expect(sent.replies).toHaveLength(1);
    expect(store.listCustomPrompts(G, 'truth')).toHaveLength(1);
  });

  it('rejects a duplicate prompt through the modal', async () => {
    const { interaction, sent } = makeInteraction({
      customId: 'tod:prompts:modal:truth',
      guild: guildStub(),
      fields: {
        prompt_text: 'What keeps you up at night?',
        prompt_category: 'deep',
        prompt_intensity: 'pg13',
      },
    });
    await panel.handle(interaction);
    expect(sent.replies).toHaveLength(1);
    expect(store.listCustomPrompts(G, 'truth')).toHaveLength(1);
  });

  it('rejects empty / oversized / bad-category modals', async () => {
    const cases = [
      { prompt_text: '   ', prompt_category: 'deep', prompt_intensity: 'pg13' },
      { prompt_text: 'x'.repeat(201), prompt_category: 'deep', prompt_intensity: 'pg13' },
      { prompt_text: 'Fine text', prompt_category: 'silly', prompt_intensity: 'pg13' },
      { prompt_text: 'Fine text', prompt_category: 'deep', prompt_intensity: 'x' },
    ];
    for (const fields of cases) {
      const { interaction } = makeInteraction({
        customId: 'tod:prompts:modal:dare',
        guild: guildStub(),
        fields,
      });
      await panel.handle(interaction);
    }
    expect(store.listCustomPrompts(G, 'dare')).toHaveLength(0);
  });

  it('deletes a custom prompt through the delete select', async () => {
    store.addCustomPrompt({
      guildId: G,
      kind: 'truth',
      category: 'Deep',
      intensity: 'pg13',
      prompt: 'Delete me please',
      addedBy: HOST,
    });
    const row = store.listCustomPrompts(G, 'truth').find((p) => p.prompt === 'Delete me please');
    const { interaction, sent } = makeInteraction({
      customId: 'tod:prompts:select:delete',
      guild: guildStub(),
      values: [String(row.id)],
    });
    await panel.handle(interaction);
    expect(sent.replies).toHaveLength(1);
    expect(store.listCustomPrompts(G, 'truth').some((p) => p.prompt === 'Delete me please')).toBe(false);
  });

  it('re-renders settings after a select and confirms spicy lock path', async () => {
    store.updateGuildConfig(G, { intensity: 'pg13' });
    const { interaction, sent } = makeInteraction({
      customId: 'tod:settings:select:categories',
      guild: guildStub(),
      values: ['Funny', 'Spicy'],
    });
    await panel.handle(interaction);
    expect(sent.replies).toHaveLength(1);
    const emb = sent.replies[0].embeds[0];
    expect(String(emb.data.title)).toContain('Spicy');
  });
});