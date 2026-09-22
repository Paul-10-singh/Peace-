/*
 * Peace* - Discord Bot - Developed by Smith.Code
 * Truth or Dare - ui builder tests (Deliverable 5)
 *
 * Enforces the customId contract from the mockup:
 *   tod:<area>:<action>:<ctx>  |  tod:<area>:select:<ctx>  |  tod:<area>:modal:<ctx>
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ui = require('../../src/utils/tod/ui.js');

function flatten(rows) {
  return rows.flatMap((r) => (r.components || r.data?.components || []));
}

function idsOf(rows) {
  return flatten(rows).map((c) => (c.custom_id || c.data?.custom_id || c.customId));
}

describe('ctx ids', () => {
  it('joins gid:sid:uid in order', () => {
    expect(ui.ctxIds({ guildId: '1', sessionId: 2, userId: '3' })).toBe('1:2:3');
  });

  it('skips missing ctx parts', () => {
    expect(ui.ctxIds({ guildId: '1' })).toBe('1');
  });
});

describe('main panel', () => {
  it('is two rows with five tod:panel buttons', () => {
    const rows = ui.mainPanelRow();
    expect(rows).toHaveLength(2);
    expect(idsOf(rows)).toEqual([
      'tod:panel:start',
      'tod:panel:settings',
      'tod:panel:prompts',
      'tod:panel:stats',
      'tod:panel:history',
    ]);
  });
});

describe('lobby row', () => {
  it('ships join / start / leave custom ids', () => {
    expect(idsOf([ui.lobbyRow()])).toEqual(['tod:lobby:join', 'tod:lobby:start', 'tod:lobby:leave']);
  });
});

describe('round + prompt rows', () => {
  const ctx = { guildId: '111111111111111111', sessionId: 42, userId: '222222222222222222' };

  it('round buttons embed the gid:sid:uid context', () => {
    expect(idsOf([ui.roundRow(ctx)])).toEqual([
      `tod:round:truth:111111111111111111:42:222222222222222222`,
      `tod:round:dare:111111111111111111:42:222222222222222222`,
      `tod:round:skip:111111111111111111:42:222222222222222222`,
    ]);
  });

  it('prompt (answer) buttons embed the same context', () => {
    expect(idsOf([ui.promptRow(ctx)])).toEqual([
      `tod:answer:done:111111111111111111:42:222222222222222222`,
      `tod:answer:skip:111111111111111111:42:222222222222222222`,
      `tod:answer:refuse:111111111111111111:42:222222222222222222`,
    ]);
  });

  it('custom ids respect the 100-char discord limit', () => {
    for (const id of idsOf([ui.roundRow(ctx), ui.promptRow(ctx)])) {
      expect(id.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('end + history rows', () => {
  it('end row uses tod:end:again / tod:end:log', () => {
    expect(idsOf([ui.endRow()])).toEqual(['tod:end:again', 'tod:end:log']);
  });

  it('history row uses tod:history:prev / next / export', () => {
    expect(idsOf([ui.historyRow()])).toEqual(['tod:history:prev', 'tod:history:next', 'tod:history:export']);
  });
});

describe('settings selects', () => {
  it('single intensity row is a tod:settings:select:intensity with 3 options', () => {
    const row = ui.settingsSelectRow('intensity', { intensity: 'pg13' });
    expect(idsOf([row])).toEqual(['tod:settings:select:intensity']);
    const menu = row.toJSON().components[0];
    expect(menu.options).toHaveLength(3);
    expect(menu.placeholder).toContain('PG-13');
    expect(menu.min_values).toBe(1);
  });

  it('categories select allows multiple selections', () => {
    const menu = ui.settingsSelectRow('categories', {}).toJSON().components[0];
    expect(menu.options).toHaveLength(4);
    expect(menu.max_values).toBe(4);
  });

  it('batch builder caps at the 5-row discord limit', () => {
    const rows = ui.settingsSelectRows(ui.DEFAULT_SETTING_KEYS, {});
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it('unknown setting key throws TypeError', () => {
    expect(() => ui.settingsSelectRow('bogus', {})).toThrow(TypeError);
  });
});

describe('channel pick + spicy confirm', () => {
  it('channel row is a gated text-channel select', () => {
    const row = ui.channelRow();
    const menu = row.components[0];
    expect(menu.data.custom_id).toBe('tod:panel:select:channel');
    expect(menu.data.channel_types).toContain(0); // GuildText
  });

  it('spicy confirm row has enable/cancel buttons', () => {
    expect(idsOf([ui.spicyConfirmRow()])).toEqual(['tod:spicy:enable', 'tod:spicy:cancel']);
  });
});

describe('prompt modals', () => {
  it('truth modal uses tod:prompts:modal:truth', () => {
    const modal = ui.addPromptModal('truth');
    expect(modal.toJSON().custom_id).toBe('tod:prompts:modal:truth');
    expect(modal.toJSON().components).toHaveLength(3);
  });

  it('dare modal uses tod:prompts:modal:dare', () => {
    expect(ui.addPromptModal('dare').toJSON().custom_id).toBe('tod:prompts:modal:dare');
  });

  it('rejects invalid modal kind', () => {
    expect(() => ui.addPromptModal('challenge')).toThrow(TypeError);
  });
});