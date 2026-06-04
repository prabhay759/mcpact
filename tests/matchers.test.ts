import { describe, expect, it } from 'vitest';
import {
  boolean,
  decimal,
  eachLike,
  getSample,
  include,
  integer,
  like,
  matchResponse,
  matchValue,
  nullValue,
  term,
} from '../src/matchers.js';

describe('like()', () => {
  it('matches same primitive type', () => {
    expect(matchValue('hello', like('world')).match).toBe(true);
    expect(matchValue(42, like(0)).match).toBe(true);
    expect(matchValue(true, like(false)).match).toBe(true);
  });

  it('rejects wrong type', () => {
    const r = matchValue('hello', like(42));
    expect(r.match).toBe(false);
    expect(r.error).toContain('"number"');
  });
});

describe('eachLike()', () => {
  it('matches an array where every item satisfies the template', () => {
    expect(matchValue([1, 2, 3], eachLike(0)).match).toBe(true);
    expect(matchValue(['a', 'b'], eachLike('')).match).toBe(true);
  });

  it('rejects a non-array', () => {
    expect(matchValue('not an array', eachLike('x')).match).toBe(false);
  });

  it('enforces minimum length', () => {
    const r = matchValue(['x'], eachLike('x', 3));
    expect(r.match).toBe(false);
    expect(r.error).toMatch(/3 item/);
  });

  it('reports index of first failing element', () => {
    const r = matchValue([1, 2, 'three'], eachLike(0));
    expect(r.match).toBe(false);
    expect(r.error).toContain('Array[2]');
  });
});

describe('term()', () => {
  it('passes when the regex matches', () => {
    expect(matchValue('temperature 18°C', term('temperature \\d+°C', 'temperature 18°C')).match).toBe(true);
  });

  it('fails when the regex does not match', () => {
    const r = matchValue('no digits here', term('\\d+', '42'));
    expect(r.match).toBe(false);
    expect(r.error).toContain('/\\d+/');
  });

  it('rejects non-strings', () => {
    expect(matchValue(123, term('\\d+', '42')).match).toBe(false);
  });
});

describe('include()', () => {
  it('passes when the string contains the substring', () => {
    expect(matchValue('temperature 18°C humidity 72%', include('temperature')).match).toBe(true);
  });

  it('fails when the substring is absent', () => {
    const r = matchValue('cloudy skies', include('temperature'));
    expect(r.match).toBe(false);
    expect(r.error).toContain('temperature');
  });
});

describe('integer()', () => {
  it('accepts integers', () => {
    expect(matchValue(0, integer()).match).toBe(true);
    expect(matchValue(-5, integer()).match).toBe(true);
  });

  it('rejects floats and strings', () => {
    expect(matchValue(3.14, integer()).match).toBe(false);
    expect(matchValue('42', integer()).match).toBe(false);
  });
});

describe('decimal()', () => {
  it('accepts any number', () => {
    expect(matchValue(3.14, decimal()).match).toBe(true);
    expect(matchValue(42, decimal()).match).toBe(true);
  });

  it('rejects non-numbers', () => {
    expect(matchValue('3.14', decimal()).match).toBe(false);
  });
});

describe('boolean()', () => {
  it('accepts true and false', () => {
    expect(matchValue(true, boolean()).match).toBe(true);
    expect(matchValue(false, boolean()).match).toBe(true);
  });

  it('rejects truthy non-booleans', () => {
    expect(matchValue(1, boolean()).match).toBe(false);
    expect(matchValue('true', boolean()).match).toBe(false);
  });
});

describe('nullValue()', () => {
  it('accepts null', () => {
    expect(matchValue(null, nullValue()).match).toBe(true);
  });

  it('rejects undefined and 0', () => {
    expect(matchValue(undefined, nullValue()).match).toBe(false);
    expect(matchValue(0, nullValue()).match).toBe(false);
  });
});

describe('getSample()', () => {
  it('extracts sample from matchers', () => {
    expect(getSample(like('hello'))).toBe('hello');
    expect(getSample(include('temp'))).toBe('temp');
    expect(getSample(integer(7))).toBe(7);
    expect(getSample(term('\\d+', '42'))).toBe('42');
  });

  it('expands eachLike to an array of min length', () => {
    expect(getSample(eachLike('x'))).toEqual(['x']);
    expect(getSample(eachLike('x', 3))).toEqual(['x', 'x', 'x']);
  });

  it('passes through plain scalars unchanged', () => {
    expect(getSample('plain')).toBe('plain');
    expect(getSample(99)).toBe(99);
    expect(getSample(null)).toBe(null);
  });

  it('recursively extracts from plain objects', () => {
    const result = getSample({ text: like('hello'), count: integer(3), flag: true });
    expect(result).toEqual({ text: 'hello', count: 3, flag: true });
  });

  it('recursively extracts from arrays', () => {
    expect(getSample([like(1), like(2)])).toEqual([1, 2]);
  });
});

describe('matchResponse()', () => {
  it('matches when content satisfies all expectations', () => {
    const actual = { content: [{ type: 'text', text: 'Current temperature: 18°C' }] };
    const expected = { content: [{ type: 'text', text: include('temperature') }] };
    expect(matchResponse(actual, expected).match).toBe(true);
  });

  it('reports the failing field in errors', () => {
    const actual = { content: [{ type: 'text', text: 'No data' }] };
    const expected = { content: [{ type: 'text', text: include('temperature') }] };
    const r = matchResponse(actual, expected);
    expect(r.match).toBe(false);
    expect(r.errors[0]).toContain('temperature');
  });

  it('fails when actual has fewer content items than expected', () => {
    const actual = { content: [] };
    const expected = { content: [{ type: 'text', text: 'x' }] };
    expect(matchResponse(actual, expected).match).toBe(false);
  });

  it('ignores extra actual content items', () => {
    const actual = { content: [{ type: 'text', text: 'hello' }, { type: 'text', text: 'world' }] };
    const expected = { content: [{ type: 'text', text: like('any') }] };
    expect(matchResponse(actual, expected).match).toBe(true);
  });

  it('checks isError flag', () => {
    expect(matchResponse({ isError: true }, { isError: true }).match).toBe(true);
    expect(matchResponse({ isError: false }, { isError: true }).match).toBe(false);
    expect(matchResponse({}, { isError: false }).match).toBe(true);
  });
});
