import { describe, expect, it } from 'vitest';
import { lastWorkoutText } from '../../web/src/features/workout/highlight-rules.ts';

const TODAY = '2026-10-21';

describe('lastWorkoutText', () => {
  it('counts the days since the latest workout', () => {
    expect(lastWorkoutText(['2026-10-02', TODAY, '2026-10-18'], TODAY)).toBe('Today');
    expect(lastWorkoutText(['2026-10-20', '2026-10-02'], TODAY)).toBe('Yesterday');
    expect(lastWorkoutText(['2026-10-02', '2026-10-18'], TODAY)).toBe('3 days ago');
    expect(lastWorkoutText(['2026-09-30'], TODAY)).toBe('21 days ago');
  });

  it('has nothing to say without a workout in the range', () => {
    expect(lastWorkoutText([], TODAY)).toBeNull();
  });
});
