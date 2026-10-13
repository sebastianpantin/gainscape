import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { countUpValue } from '../../web/src/lib/ui/count-up-rules.ts';

describe('countUpValue', () => {
  it('starts at zero and lands on the target', () => {
    expect(countUpValue(1250, 0, 900)).toBe(0);
    expect(countUpValue(1250, 900, 900)).toBe(1250);
    expect(countUpValue(1250, 5000, 900)).toBe(1250);
  });

  it('eases out, so most of the count happens early', () => {
    expect(countUpValue(1000, 450, 900)).toBe(875);
  });

  it('shows the target at once when there is no time to count', () => {
    expect(countUpValue(80, 0, 0)).toBe(80);
  });

  it('counts from a starting value', () => {
    expect(countUpValue(12, 0, 900, 10)).toBe(10);
    expect(countUpValue(12, 900, 900, 10)).toBe(12);
    expect(countUpValue(110, 450, 900, 10)).toBe(98);
  });

  it('never goes backwards and never passes the target', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 0, max: 6000 }),
        fc.integer({ min: 0, max: 6000 }),
        (target, durationMs, first, second) => {
          const [earlier, later] = [first, second].sort((a, b) => a - b);
          const earlierValue = countUpValue(target, earlier, durationMs);
          const laterValue = countUpValue(target, later, durationMs);
          expect(earlierValue).toBeLessThanOrEqual(laterValue);
          expect(laterValue).toBeLessThanOrEqual(target);
          expect(Number.isInteger(laterValue)).toBe(true);
        },
      ),
    );
  });
});
