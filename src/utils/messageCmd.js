/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Message-prefix command runner: lets no-prefix users type `n <command>` in a
 * server (e.g. `n play`, `n help`, `n say`) and have it behave like the slash
 * command. Uses the command's own SlashCommandBuilder option schema to parse
 * arguments, and wraps the invocation in a minimal interaction adapter so the
 * existing command execute() handlers run unchanged.
 *
 * Security: the same 4-tier access checks as slash commands are enforced, and
 * only users in the no-prefix list (or owners) may invoke the prefix.
 */
const { MessageFlags } = require('discord.js');

const OPT = {
  SUB: 1, GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5,
  USER: 6, CHANNEL: 7, ROLE: 8, MENTIONABLE: 9, NUMBER: 10,
};

function isOwnerId(client, userId, guildId) {
  try {
    return require('../utils/owners').isOwner(userId, guildId);
  } catch {
    return false;
  }
}

function hasUserId(userId) {
  try {
    return require('../utils/noprefix').isNoprefix(userId);
  } catch {
    return false;
  }
}

/** Recursively collect .content strings from a V2 container/subcomponent graph. */
function extractContainerText(components) {
  const texts = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.content === 'string' && node.content.length) texts.push(node.content);
    if (Array.isArray(node.components)) node.components.forEach(walk);
    if (Array.isArray(node.items)) node.items.forEach(walk);
    if (Array.isArray(node.options)) node.options.forEach(walk);
  };
  (components || []).forEach(walk);
  return texts.join('\n') || null;
}

/** Convert an interaction payload into a plain message-send payload. */
function toMessagePayload(payload = {}) {
  const out = { ...payload };
  delete out.flags;

  const containerText = extractContainerText(out.components);
  if (containerText) {
    out.content = out.content ? `${out.content}\n${containerText}` : containerText;
  }
  if (containerText || Array.isArray(out.components)) delete out.components;
  if (out.ephemeral !== undefined) delete out.ephemeral;
  return out;
}

const MENTION_RE = /^<(@!?|@&|#)(\d{15,20})>$/;
const SNOWFLAKE_RE = /^(\d{15,20})$/;

function resolveMention(token) {
  const m = String(token).match(MENTION_RE);
  if (m) return { kind: m[1], id: m[2] };
  if (SNOWFLAKE_RE.test(String(token).trim())) return { kind: 'id', id: String(token).trim() };
  return null;
}

function parseBoolean(token) {
  const v = String(token).toLowerCase();
  if (['true', 'yes', 'on', '1', 'y'].includes(v)) return true;
  if (['false', 'no', 'off', '0', 'n'].includes(v)) return false;
  return undefined;
}

/**
 * Resolve raw argument tokens against the command's option schema.
 * Supports positional args and `--name value` / `--name=value`.
 * Returns { values, sub, group, data } where values is a Map keyed by option name.
 */
function resolveOptions(command, args, message) {
  const json = command.data.toJSON();
  const top = json.options || [];
  const values = new Map();
  let sub = null;
  let group = null;
  const tokens = [...args];

  const hasSubs = top.some((o) => o.type === OPT.SUB || o.type === OPT.GROUP);
  let leafOpts = top.filter((o) => o.type !== OPT.SUB && o.type !== OPT.GROUP);

  if (hasSubs && tokens.length) {
    const first = tokens.shift();
    const match = first && top.find((o) => o.name === first);
    if (match?.type === OPT.GROUP) {
      group = match.name;
      const second = tokens.shift();
      const subMatch = second && (match.options || []).find((o) => o.name === second);
      if (subMatch) {
        sub = subMatch.name;
        leafOpts = subMatch.options || [];
      } else {
        sub = second || null;
        leafOpts = [];
      }
    } else if (match?.type === OPT.SUB) {
      sub = match.name;
      leafOpts = match.options || [];
    } else {
      // First token was not a known subcommand: treat it as the sub name.
      sub = first;
      leafOpts = [];
    }
  }

  const guild = message.guild;
  const channelOf = (id) => guild?.channels?.cache?.get?.(id) || null;
  const roleOf = (id) => guild?.roles?.cache?.get?.(id) || null;
  const userOf = (id) =>
    message.mentions?.users?.get?.(id) ||
    message.client?.users?.cache?.get?.(id) ||
    null;

  function inject(resolvedId, type, name) {
    if (type === OPT.USER) {
      const u = userOf(resolvedId) || { id: resolvedId, username: resolvedId, tag: resolvedId };
      values.set(name, u);
    } else if (type === OPT.CHANNEL) {
      values.set(name, channelOf(resolvedId) || { id: resolvedId });
    } else if (type === OPT.ROLE) {
      values.set(name, roleOf(resolvedId) || { id: resolvedId });
    } else if (type === OPT.MENTIONABLE) {
      values.set(name, userOf(resolvedId) || roleOf(resolvedId) || { id: resolvedId });
    }
  }

  let i = 0;
  const named = new Map();
  const positionals = [];
  for (i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const eq = /^--([a-zA-Z0-9_]+)=(.*)$/.exec(tok);
    if (eq) { named.set(eq[1], eq[2]); continue; }
    const flag = /^--([a-zA-Z0-9_]+)$/.exec(tok);
    if (flag) {
      if (i + 1 < tokens.length) named.set(flag[1], tokens[i + 1]);
      i++;
      continue;
    }
    positionals.push(tok);
  }

  // Pre-extract tokens that exactly match a string option's `choices`, so a
  // trailing flag-word (e.g. `n play some song youtube`) maps to that option
  // and not into the free-text query.
  for (const opt of leafOpts) {
    if (opt.type !== OPT.STRING || !(opt.choices && opt.choices.length)) continue;
    if (named.has(opt.name)) continue;
    const idx = positionals.findIndex((t) => opt.choices.some((c) => c.name === t || c.value === t));
    if (idx !== -1) values.set(opt.name, positionals.splice(idx, 1)[0]);
  }
  // The option that swallows every remaining word: the last free-text string
  // (no `choices`). If none, fall back to the last string option overall.
  let swallowIndex = -1;
  for (let i = leafOpts.length - 1; i >= 0; i--) {
    const o = leafOpts[i];
    if (o.type === OPT.STRING && !(o.choices && o.choices.length)) { swallowIndex = i; break; }
  }
  if (swallowIndex === -1) {
    for (let i = leafOpts.length - 1; i >= 0; i--) {
      if (leafOpts[i].type === OPT.STRING) { swallowIndex = i; break; }
    }
  }
  for (let oi = 0; oi < leafOpts.length; oi++) {
    const opt = leafOpts[oi];
    if (values.has(opt.name)) continue; // already filled (named or choice pass)
    if (named.has(opt.name)) {
      const raw = named.get(opt.name);
      if (opt.type === OPT.INTEGER || opt.type === OPT.NUMBER) {
        const num = Number(raw);
        values.set(opt.name, Number.isNaN(num) ? null : (opt.type === OPT.INTEGER ? Math.trunc(num) : num));
      } else if (opt.type === OPT.BOOLEAN) {
        values.set(opt.name, parseBoolean(raw));
      } else if (
        opt.type === OPT.USER || opt.type === OPT.CHANNEL ||
        opt.type === OPT.ROLE || opt.type === OPT.MENTIONABLE
      ) {
        const res = resolveMention(raw);
        if (res) inject(res.id, opt.type, opt.name);
        else values.set(opt.name, null);
      } else {
        values.set(opt.name, raw);
      }
      continue;
    }

    if (opt.type === OPT.STRING) {
      const isSwallow = oi === swallowIndex;
      const withChoices = !!(opt.choices && opt.choices.length);
      if (withChoices && !isSwallow) {
        // Only assign when the next word exactly matches one of the choices.
        const first = positionals[0];
        if (first && opt.choices.some((c) => c.name === first || c.value === first)) {
          values.set(opt.name, positionals.shift());
        } else {
          values.set(opt.name, null);
        }
      } else if (isSwallow && positionals.length) {
        values.set(opt.name, positionals.join(' '));
        positionals.length = 0;
      } else {
        values.set(opt.name, positionals.length ? positionals.shift() : null);
      }
    } else if (opt.type === OPT.INTEGER) {
      const n = positionals.length ? Number(positionals[0]) : NaN;
      if (!Number.isNaN(n)) positionals.shift();
      values.set(opt.name, Number.isNaN(n) ? null : Math.trunc(n));
    } else if (opt.type === OPT.NUMBER) {
      const n = positionals.length ? Number(positionals[0]) : NaN;
      if (!Number.isNaN(n)) positionals.shift();
      values.set(opt.name, Number.isNaN(n) ? null : n);
    } else if (opt.type === OPT.BOOLEAN) {
      if (positionals.length) {
        const b = parseBoolean(positionals[0]);
        if (b !== undefined) positionals.shift();
        values.set(opt.name, b);
      } else {
        values.set(opt.name, undefined);
      }
    } else if (
      opt.type === OPT.USER || opt.type === OPT.CHANNEL ||
      opt.type === OPT.ROLE || opt.type === OPT.MENTIONABLE
    ) {
      let found = null;
      for (let p = 0; p < positionals.length; p++) {
        const res = resolveMention(positionals[p]);
        if (res) {
          found = res;
          positionals.splice(p, 1);
          break;
        }
      }
      if (found) inject(found.id, opt.type, opt.name);
      else values.set(opt.name, null);
    }
  }

  return { values, sub, group };
}

/**
 * Build an interaction-like facade over a Message so command.execute() works
 * unchanged. Underneath it sends normal channel messages.
 */
function createFacade(message, client, resolved) {
  const channel = message.channel;
  const state = { replied: false, deferred: false, lastMsg: null };

  const facade = {
    id: message.id,
    token: '__message__',
    user: message.author,
    member: message.member,
    guild: message.guild,
    channel,
    client,
    options: { data: [] },
    createdTimestamp: message.createdTimestamp,
    get replied() { return state.replied; },
    get deferred() { return state.deferred; },
    set replied(v) { state.replied = v; },
    set deferred(v) { state.deferred = v; },
    values: [],

    async deferReply() { state.deferred = true; },
    async deferUpdate() {},

    async reply(payload) {
      if (state.replied) return facade.followUp(payload);
      state.replied = true;
      const msg = await channel.send(toMessagePayload(payload)).catch(() => null);
      state.lastMsg = msg;
      return msg;
    },

    async followUp(payload) {
      const msg = await channel.send(toMessagePayload(payload)).catch(() => null);
      if (msg) state.lastMsg = msg;
      return msg;
    },

    async editReply(payload) {
      if (state.lastMsg && typeof state.lastMsg.edit === 'function') {
        return state.lastMsg.edit(toMessagePayload(payload)).catch(() => null);
      }
      return facade.followUp(payload);
    },

    async update(payload) {
      return facade.editReply(payload);
    },

    async deleteReply() {
      if (state.lastMsg && typeof state.lastMsg.delete === 'function') {
        return state.lastMsg.delete().catch(() => null);
      }
      return null;
    },

    async fetchReply() {
      return state.lastMsg;
    },
  };

  facade.options = {
    data: [{ options: [] }],
    getString(name, required) {
      const v = resolved.values.get(name);
      if ((v === undefined || v === null) && required) throw new Error(`Missing required option: ${name}`);
      return v === undefined ? null : String(v);
    },
    getInteger(name, required) {
      const v = resolved.values.get(name);
      if ((v === undefined || v === null) && required) throw new Error(`Missing required option: ${name}`);
      return typeof v === 'number' ? v : null;
    },
    getNumber(name, required) {
      return facade.options.getInteger(name, required);
    },
    getBoolean(name, required) {
      const v = resolved.values.get(name);
      return typeof v === 'boolean' ? v : null;
    },
    getUser(name, required) {
      const v = resolved.values.get(name);
      if ((v === null) && required) throw new Error(`Missing required option: ${name}`);
      return v ?? null;
    },
    getChannel(name, required) {
      return facade.options.getUser(name, required);
    },
    getRole(name, required) {
      return facade.options.getUser(name, required);
    },
    getMentionable(name, required) {
      return facade.options.getUser(name, required);
    },
    getSubcommand(getDefault = true) {
      return resolved.sub ?? (getDefault ? null : undefined);
    },
    getSubcommandGroup(getDefault = true) {
      return resolved.group ?? (getDefault ? null : undefined);
    },
  };

  const flags = { Ephemeral: MessageFlags.Ephemeral, IsComponentsV2: MessageFlags.IsComponentsV2 };
  Object.defineProperty(facade.options, 'MessageFlags', { value: flags, enumerable: false });
  facade.options.data[0].options = [...resolved.values.entries()].map(([name, value]) => ({ name, value }));
  facade.options.data[0].name = resolved.sub;

  return facade;
}

/** Main entry: handles a `n <command> [args...]` message when the author is allowed. */
async function tryRunMessageCommand(client, message) {
  if (!message.content || !message.content.startsWith('n ')) return false;
  if (message.author?.bot || !message.guild) return false;

  const allowed = hasUserId(message.author.id);
  if (!allowed && !isOwnerId(client, message.author.id, message.guild.id)) return false;

  const rest = message.content.slice(2).trim();
  if (!rest) return false;
  const [name, ...args] = rest.split(/\s+/);

  const command = client.commands.get(name);
  if (!command) {
    await message.channel
      .send({ content: `<:cross:1534849320568750221> Command **\`${name}\`** not found. Try \`n help\`.` })
      .catch(() => {});
    return true;
  }

  // Enforce the same 4-tier access control as slash commands.
  const { hasAccess } = require('../utils/permissions');
  const { isOwner } = require('../utils/owners');
  const resolved = resolveOptions(command, args, message);
  const allowedAccess = command.ownerOnly
    ? isOwner(message.author.id, message.guild?.id)
    : hasAccess(message.author, message.guild, command.data.name, resolved.sub);
  if (!allowedAccess) {
    await message.channel
      .send({ content: "<:cross:1534849320568750221> You don't have permission to use this command." })
      .catch(() => {});
    return true;
  }

  const facade = createFacade(message, client, resolved);
  try {
    const previous = client.embedModule;
    client.embedModule = command.__folder;
    try {
      await command.execute(facade, client);
    } finally {
      client.embedModule = previous;
    }
  } catch (err) {
    if (typeof err?.code === 'number' && [10062, 10060, 40060].includes(err.code)) return true;
    console.error(`[PeaceX] [n <${name}>] Error:`, err);
    await facade
      .reply({ content: 'Something went wrong while running that command. Try `/' + name + '` instead.' })
      .catch(() => {});
  }
  return true;
}

module.exports = { tryRunMessageCommand, resolveOptions, createFacade };