import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const evaluator = require('../../src/utils/counter/evaluator.js');

describe('evaluator.tokenize', () => {
  it('accepts plain numbers', () => {
    const r = evaluator.tokenize('123');
    expect(r.ok).toBe(true);
    expect(r.tokens).toEqual(['NUM:123']);
  });

  it('handles operators and parens', () => {
    const r = evaluator.tokenize('(1+2)*3');
    expect(r.ok).toBe(true);
    expect(r.tokens).toEqual(['(', 'NUM:1', '+', 'NUM:2', ')', '*', 'NUM:3']);
  });

  it('rejects non-arithmetic characters', () => {
    const r = evaluator.tokenize('1a');
    expect(r.ok).toBe(false);
  });

  it('strips whitespace', () => {
    const r = evaluator.tokenize('  1 + 1  ');
    expect(r.ok).toBe(true);
  });

  it('rejects empty input', () => {
    const r = evaluator.tokenize('   ');
    expect(r.ok).toBe(false);
  });
});

describe('evaluator.evaluate', () => {
  it('adds', () => {
    expect(evaluator.evaluate('1+1').value).toBe(2);
  });

  it('respects precedence', () => {
    expect(evaluator.evaluate('1+2*3').value).toBe(7);
  });

  it('respects parens', () => {
    expect(evaluator.evaluate('(1+2)*3').value).toBe(9);
  });

  it('subtracts', () => {
    expect(evaluator.evaluate('10-3').value).toBe(7);
  });

  it('multiplies first', () => {
    expect(evaluator.evaluate('2*3+4').value).toBe(10);
  });

  it('divides evenly', () => {
    expect(evaluator.evaluate('10/2').value).toBe(5);
  });

  it('rejects division by zero', () => {
    expect(evaluator.evaluate('7/0').ok).toBe(false);
  });

  it('rejects non-integer division', () => {
    expect(evaluator.evaluate('5/2').ok).toBe(false);
  });

  it('rejects negative results', () => {
    expect(evaluator.evaluate('3-5').ok).toBe(false);
  });

  it('rejects overflow', () => {
    expect(evaluator.evaluate('9999999999*9999999999').ok).toBe(false);
  });

  it('rejects empty', () => {
    expect(evaluator.evaluate('').ok).toBe(false);
  });

  it('rejects trailing operator', () => {
    expect(evaluator.evaluate('1+').ok).toBe(false);
  });

  it('rejects leading operator', () => {
    expect(evaluator.evaluate('*1').ok).toBe(false);
  });

  it('rejects unbalanced parens', () => {
    expect(evaluator.evaluate('(1+2').ok).toBe(false);
  });

  it('rejects junk', () => {
    expect(evaluator.evaluate('hello').ok).toBe(false);
  });
});

describe('evaluator.isValidSyntax', () => {
  it('accepts valid expressions', () => {
    expect(evaluator.isValidSyntax('1+1')).toBe(true);
  });

  it('rejects invalid expressions', () => {
    expect(evaluator.isValidSyntax('1+')).toBe(false);
  });
});
