import { describe, expect, it } from 'vitest';
import { parsedValues, problemOf } from '../../web/src/lib/parsed.ts';

describe('parsed form fields', () => {
  it('gives the problem of a field that did not parse, and none for one that did', () => {
    expect(problemOf({ kind: 'problem', problem: 'Enter a name.' })).toBe('Enter a name.');
    expect(problemOf({ kind: 'ok', value: 'Mira' })).toBeNull();
  });

  it('collects every value once all fields parse, and nothing while one has a problem', () => {
    expect(parsedValues({ name: { kind: 'ok', value: 'Mira' }, year: { kind: 'ok', value: null } })).toEqual({
      name: 'Mira',
      year: null,
    });
    expect(
      parsedValues({ name: { kind: 'ok', value: 'Mira' }, year: { kind: 'problem', problem: 'Enter a year.' } }),
    ).toBeNull();
  });
});
