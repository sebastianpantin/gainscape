import { describe, expect, it } from 'vitest';
import { nullableNumber } from '../../web/src/lib/rows.ts';

describe('nullableNumber', () => {
  it('keeps null and turns numeric strings from Postgres into numbers', () => {
    expect(nullableNumber(null)).toBeNull();
    expect(nullableNumber('72.5')).toBe(72.5);
    expect(nullableNumber(3)).toBe(3);
  });
});
