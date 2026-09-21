'use strict';
/* Peace counters — evaluator.js (Deliverable 3)
 * Safe arithmetic parser for mode 'numbers_arithmetic'.
 * NO eval, NO Function, NO vm. Hand-rolled recursive descent.
 * Integer-only; `/` must divide evenly. Result must be >= 0.
 */

const MAX_EXPR_LENGTH = 64;

const TOKEN_RE = /^[0-9()+\-*/]$/;

function tokenize(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'not_a_string' };
  }
  const src = raw.trim();
  if (src.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (src.length > MAX_EXPR_LENGTH) {
    return { ok: false, reason: 'too_long' };
  }

  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < src.length && src[j] >= '0' && src[j] <= '9') {
        j += 1;
      }
      tokens.push('NUM:' + src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push(ch);
      i += 1;
      continue;
    }
    return { ok: false, reason: 'bad_char:' + ch };
  }
  return { ok: true, tokens };
}

function parseExpr(tokens, pos) {
  let left = parseTerm(tokens, pos);
  while (pos.i < tokens.length) {
    const op = tokens[pos.i];
    if (op === '+' || op === '-') {
      pos.i += 1;
      const right = parseTerm(tokens, pos);
      left = op === '+' ? left + right : left - right;
    } else {
      break;
    }
  }
  return left;
}

function parseTerm(tokens, pos) {
  let left = parseFactor(tokens, pos);
  while (pos.i < tokens.length) {
    const op = tokens[pos.i];
    if (op === '*' || op === '/') {
      pos.i += 1;
      const right = parseFactor(tokens, pos);
      if (op === '*') {
        left *= right;
      } else {
        if (right === 0) {
          const e = new Error('div_zero');
          e.reason = 'div_zero';
          throw e;
        }
        if (left % right !== 0) {
          const e = new Error('not_whole');
          e.reason = 'not_whole';
          throw e;
        }
        left = (left / right) | 0;
      }
    } else {
      break;
    }
  }
  return left;
}

function parseFactor(tokens, pos) {
  const t = tokens[pos.i];
  if (t === undefined) {
    const e = new Error('unexpected_end');
    e.reason = 'unexpected_end';
    throw e;
  }
  if (t === '+' || t === '-') {
    pos.i += 1;
    const v = parseFactor(tokens, pos);
    return t === '-' ? -v : v;
  }
  if (t === '(') {
    pos.i += 1;
    const v = parseExpr(tokens, pos);
    if (tokens[pos.i] !== ')') {
      const e = new Error('unbalanced_paren');
      e.reason = 'unbalanced_paren';
      throw e;
    }
    pos.i += 1;
    return v;
  }
  if (t.startsWith('NUM:')) {
    pos.i += 1;
    return Number(t.slice(4));
  }
  const e = new Error('unexpected_token:' + t);
  e.reason = 'unexpected_token';
  throw e;
}

/** Evaluate a raw expression. { ok:true, value } | { ok:false, reason }. Never throws. */
function evaluate(raw) {
  const tok = tokenize(raw);
  if (!tok.ok) return { ok: false, reason: tok.reason };

  if (tok.tokens[0] === '*' || tok.tokens[0] === '/' || tok.tokens[0] === ')') {
    return { ok: false, reason: 'bad_start' };
  }

  for (let k = 0; k < tok.tokens.length - 1; k++) {
    const a = tok.tokens[k];
    const b = tok.tokens[k + 1];
    if (a.startsWith('NUM:') && b.startsWith('NUM:')) {
      return { ok: false, reason: 'adjacent_numbers' };
    }
    if (a.startsWith('NUM:') && b === '(') {
      return { ok: false, reason: 'number_then_paren' };
    }
    if (a === ')' && b.startsWith('NUM:')) {
      return { ok: false, reason: 'paren_then_number' };
    }
    if (a === ')' && b === '(') {
      return { ok: false, reason: 'empty_middle' };
    }
    if ((a === '+' || a === '-' || a === '*' || a === '/') &&
        (b === '+' || b === '*' || b === '/' || b === ')')) {
      if (!(a === '+' && b === '-') && !(a === '-' && b === '-') &&
          !(a === '-' && b === '+' ) && !(a === '+' && b === '+')) {
        return { ok: false, reason: 'double_operator' };
      }
    }
  }

  const last = tok.tokens[tok.tokens.length - 1];
  if (last === '+' || last === '-' || last === '*' || last === '/' || last === '(') {
    return { ok: false, reason: 'bad_end' };
  }

  const pos = { i: 0 };
  let value;
  try {
    value = parseExpr(tok.tokens, pos);
  } catch (err) {
    return { ok: false, reason: err.reason || 'parse_error' };
  }
  if (pos.i !== tok.tokens.length) return { ok: false, reason: 'trailing_tokens' };
  if (!Number.isSafeInteger(value)) return { ok: false, reason: 'overflow' };
  if (value < 0) return { ok: false, reason: 'negative' };
  return { ok: true, value };
}

/** Normalized (whitespace-stripped) form for same-expression dedupe, or null. */
function normalize(raw) {
  const tok = tokenize(raw);
  if (!tok.ok) return null;
  const s = tok.tokens.join('');
  try {
    evaluate(raw);
  } catch (err) {
    return null;
  }
  return s;
}

function isValidSyntax(raw) {
  const tok = tokenize(raw);
  if (!tok.ok) return false;
  try {
    const pos = { i: 0 };
    parseExpr(tok.tokens, pos);
    return pos.i === tok.tokens.length;
  } catch (err) {
    return false;
  }
}

module.exports = {
  MAX_EXPR_LENGTH,
  tokenize,
  evaluate,
  normalize,
  isValidSyntax,
};
