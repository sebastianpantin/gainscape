export const POPULAR_EXERCISE_KEYS: readonly string[] = [
  'back_squat',
  'barbell_bench_press',
  'deadlift',
  'overhead_press',
  'barbell_row',
  'pull_up',
  'lat_pulldown',
  'leg_press',
];

export function popularExercises<T extends { key?: string | null }>(exercises: readonly T[]): T[] {
  const byKey = new Map(exercises.flatMap((exercise) => (exercise.key ? [[exercise.key, exercise] as const] : [])));
  return POPULAR_EXERCISE_KEYS.flatMap((key) => byKey.get(key) ?? []);
}
