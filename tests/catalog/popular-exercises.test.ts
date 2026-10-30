import { describe, expect, it } from 'vitest';
import { loadCatalogData } from '../../scripts/catalog/load.ts';
import { POPULAR_EXERCISE_KEYS } from '../../web/src/lib/exercises/popular-exercise-rules.ts';

const exercisesByKey = new Map(loadCatalogData().exercises.map((exercise) => [exercise.key, exercise]));

describe('popular exercises', () => {
  it.each(POPULAR_EXERCISE_KEYS)('%s is a catalog lift', (key) => {
    expect(exercisesByKey.get(key)?.modality).toBe('lift');
  });

  it('lists each key once', () => {
    expect(new Set(POPULAR_EXERCISE_KEYS).size).toBe(POPULAR_EXERCISE_KEYS.length);
  });
});
