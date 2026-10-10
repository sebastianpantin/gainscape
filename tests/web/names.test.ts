import { describe, expect, it } from 'vitest';
import { nameProblem, trimmedName } from '../../web/src/lib/names.ts';

describe('name validation', () => {
  it('trims whitespace, byte-order marks and zero-width spaces', () => {
    expect(trimmedName('\u200B\uFEFF\t My Press \n\uFEFF')).toBe('My Press');
  });

  it('rejects blank, control-character and overlong names', () => {
    expect(nameProblem(' \t​', 60)).toBe('Enter a name.');
    expect(nameProblem('My\u0007Press', 60)).toBe("Names can't contain control characters.");
    expect(nameProblem('x'.repeat(41), 40)).toBe('Names can be at most 40 characters.');
    expect(nameProblem(' Upper ', 40)).toBeNull();
  });

  it('treats ideographic and no-break spaces as blank', () => {
    expect(nameProblem('\u3000\u00A0\u2003', 40)).toBe('Enter a name.');
  });

  it('rejects C1 controls and bidirectional overrides and isolates', () => {
    expect(nameProblem('a\u0085b', 40)).toBe("Names can't contain control characters.");
    for (const bidi of ['\u202A', '\u202B', '\u202C', '\u202D', '\u202E', '\u2066', '\u2067', '\u2068', '\u2069']) {
      expect(nameProblem(`evil${bidi}name`, 40)).toBe("Names can't contain control characters.");
    }
  });

  it('counts characters the way the server does, so an emoji is one character', () => {
    expect(nameProblem('\u{1F3CB}'.repeat(40), 40)).toBeNull();
    expect(nameProblem('\u{1F3CB}'.repeat(41), 40)).toBe('Names can be at most 40 characters.');
  });
});
