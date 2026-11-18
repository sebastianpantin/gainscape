import { describe, expect, it } from 'vitest';
import { highestReached } from '../../web/src/lib/progress/tier-rules.ts';

const TIERS = ['low', 'middle', 'high'] as const;
const MINIMUM = { low: 1, middle: 10, high: 50 };

describe('highestReached', () => {
  it('is the last tier whose minimum the value reaches', () => {
    expect([1, 9, 10, 49, 50, 900].map((value) => highestReached(TIERS, MINIMUM, value))).toEqual([
      'low',
      'low',
      'middle',
      'middle',
      'high',
      'high',
    ]);
  });

  it('is nothing below the first minimum', () => {
    expect(highestReached(TIERS, MINIMUM, 0)).toBeNull();
    expect(highestReached([], {}, 5)).toBeNull();
  });
});
