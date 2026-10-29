import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COUNT_UP_MS, countUpStart, countUpValue, shownCountUp } from '../../web/src/lib/ui/count-up-rules.ts';

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

describe('countUpStart', () => {
  it('counts up from the number last seen on this device', () => {
    expect(countUpStart(31, 34, false)).toBe(31);
  });

  it('shows the number at once on a first view, when it did not rise or under reduced motion', () => {
    expect(countUpStart(null, 34, false)).toBe(34);
    expect(countUpStart(34, 34, false)).toBe(34);
    expect(countUpStart(40, 34, false)).toBe(34);
    expect(countUpStart(31, 34, true)).toBe(34);
  });
});

describe('shownCountUp', () => {
  it('runs a short count from the start to the number', () => {
    expect(COUNT_UP_MS).toBeGreaterThanOrEqual(600);
    expect(COUNT_UP_MS).toBeLessThanOrEqual(900);
    const run = { from: 1000, to: 2000 };
    expect(shownCountUp(run, 0)).toBe(1000);
    expect(shownCountUp(run, COUNT_UP_MS / 2)).toBe(1875);
    expect(shownCountUp(run, COUNT_UP_MS)).toBe(2000);
  });

  it('shows the number at once when there is nothing to count', () => {
    expect(shownCountUp({ from: 34, to: 34 }, 0)).toBe(34);
  });
});
