import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rpeChartPct } from '@domain/rpe-chart.ts';

const RPE_COLUMNS = [10, 9.5, 9, 8.5, 8, 7.5, 7];

const RECORDED_CHART: readonly (readonly number[])[] = [
  [100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2],
  [95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3],
  [92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7],
  [89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1],
  [86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6],
  [83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2],
];

const RECORDED_CELLS = RECORDED_CHART.flatMap((row, rowIndex) =>
  row.map((percent, column) => [rowIndex + 1, RPE_COLUMNS[column], percent] as const),
);

describe('rpeChartPct (RTS chart, fitnessvolt tuchscherer-chart-explained)', () => {
  it.each(RECORDED_CELLS)('%d reps @ RPE %d is %d% of the 1RM', (reps, rpe, percent) => {
    expect(rpeChartPct(reps, rpe)).toBeCloseTo(percent / 100, 10);
  });

  it('3 reps @ RPE 8 is 86.3%, the top-set golden', () => {
    expect(rpeChartPct(3, 8)).toBeCloseTo(0.863, 10);
  });

  it.each([
    [7, 8, 'more than 6 reps'],
    [0, 8, 'no reps'],
    [3, 6.5, 'RPE below 7'],
    [3, 6, 'RPE 6 (RIR 4)'],
    [3, 10.5, 'RPE above 10'],
    [3, 8.25, 'an RPE between half steps'],
    [2.5, 8, 'fractional reps'],
  ])('is null off the chart: %d reps @ RPE %d (%s)', (reps, rpe) => {
    expect(rpeChartPct(reps, rpe)).toBeNull();
  });

  it('1 @ 8 = 2 @ 9 = 3 @ 10 = 92.2%', () => {
    for (const [reps, rpe] of [
      [1, 8],
      [2, 9],
      [3, 10],
    ]) {
      expect(rpeChartPct(reps, rpe)).toBeCloseTo(0.922, 10);
    }
  });

  it('has the diagonal property cell(r, rpe) = cell(r + 1, rpe + 1) across the recorded table', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.constantFrom(7, 7.5, 8, 8.5, 9), (reps, rpe) => {
        const here = rpeChartPct(reps, rpe);
        expect(here).not.toBeNull();
        expect(rpeChartPct(reps + 1, rpe + 1)).toBe(here);
      }),
    );
  });

  it('falls as reps rise at the same RPE and rises as RPE rises at the same reps', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.constantFrom(7, 7.5, 8, 8.5, 9, 9.5), (reps, rpe) => {
        expect(rpeChartPct(reps + 1, rpe)!).toBeLessThan(rpeChartPct(reps, rpe)!);
        expect(rpeChartPct(reps, rpe + 0.5)!).toBeGreaterThan(rpeChartPct(reps, rpe)!);
      }),
    );
  });
});
