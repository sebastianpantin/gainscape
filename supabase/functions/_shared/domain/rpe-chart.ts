const RPE_COLUMNS: readonly number[] = [10, 9.5, 9, 8.5, 8, 7.5, 7];

const PCT_BY_REPS_AND_RPE: readonly (readonly number[])[] = [
  [1, 0.978, 0.955, 0.939, 0.922, 0.907, 0.892],
  [0.955, 0.939, 0.922, 0.907, 0.892, 0.878, 0.863],
  [0.922, 0.907, 0.892, 0.878, 0.863, 0.85, 0.837],
  [0.892, 0.878, 0.863, 0.85, 0.837, 0.824, 0.811],
  [0.863, 0.85, 0.837, 0.824, 0.811, 0.799, 0.786],
  [0.837, 0.824, 0.811, 0.799, 0.786, 0.774, 0.762],
];

export function rpeChartPct(reps: number, rpe: number): number | null {
  const column = RPE_COLUMNS.indexOf(rpe);
  if (!Number.isInteger(reps) || column < 0) return null;
  return PCT_BY_REPS_AND_RPE[reps - 1]?.[column] ?? null;
}
