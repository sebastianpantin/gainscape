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
});
