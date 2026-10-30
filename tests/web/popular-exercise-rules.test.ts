import { describe, expect, it } from 'vitest';
import { popularExercises } from '../../web/src/lib/exercises/popular-exercise-rules.ts';

function exercise(key: string | null, name: string) {
  return { key, name };
}

describe('popular exercises for an empty workout', () => {
  it('lists the available popular exercises in the popular order, not the list order', () => {
    const list = [
      exercise('deadlift', 'Deadlift'),
      exercise('lateral_raise', 'Lateral Raise'),
      exercise('back_squat', 'Back Squat'),
    ];
    expect(popularExercises(list).map((found) => found.name)).toEqual(['Back Squat', 'Deadlift']);
  });

  it('skips a popular key the list does not hold and a custom exercise without a key', () => {
    const list = [exercise(null, 'My Squat'), exercise('pull_up', 'Pull-up')];
    expect(popularExercises(list).map((found) => found.name)).toEqual(['Pull-up']);
  });
});
