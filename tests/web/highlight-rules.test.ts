import { describe, expect, it } from 'vitest';
import { lastWorkoutText, latestTrainedDate } from '../../web/src/features/workout/highlight-rules.ts';

const TODAY = '2026-10-21';

describe('lastWorkoutText', () => {
  it('counts the days since the latest workout', () => {
    expect(lastWorkoutText(['2026-10-02', TODAY, '2026-10-18'], TODAY, null)).toBe('Today');
    expect(lastWorkoutText(['2026-10-20', '2026-10-02'], TODAY, null)).toBe('Yesterday');
    expect(lastWorkoutText(['2026-10-02', '2026-10-18'], TODAY, null)).toBe('3 days ago');
    expect(lastWorkoutText(['2026-09-30'], TODAY, null)).toBe('21 days ago');
  });

  it('counts calendar days across a month or year end', () => {
    expect(lastWorkoutText(['2026-09-30'], '2026-10-01', null)).toBe('Yesterday');
    expect(lastWorkoutText(['2026-02-28'], '2026-03-01', null)).toBe('Yesterday');
    expect(lastWorkoutText(['2025-12-31'], '2026-01-02', null)).toBe('2 days ago');
  });

  it('counts calendar days across a daylight saving change, never a 23 or 25 hour day', () => {
    expect(lastWorkoutText(['2026-10-24'], '2026-10-26', null)).toBe('2 days ago');
    expect(lastWorkoutText(['2026-03-28'], '2026-03-29', null)).toBe('Yesterday');
    expect(lastWorkoutText(['2026-03-07'], '2026-03-09', null)).toBe('2 days ago');
  });

  it('falls back to the newest older workout when the strip range has none', () => {
    expect(lastWorkoutText([], TODAY, '2026-06-01')).toBe('142 days ago');
    expect(lastWorkoutText(['2026-10-25'], TODAY, '2026-08-21')).toBe('61 days ago');
  });

  it('prefers a workout in the strip range over the fallback', () => {
    expect(lastWorkoutText(['2026-10-20'], TODAY, '2026-06-01')).toBe('Yesterday');
  });

  it('has nothing to say without any workout', () => {
    expect(lastWorkoutText([], TODAY, null)).toBeNull();
  });
});

describe('latestTrainedDate', () => {
  it('reads the newest workout on or before today, so the fallback read runs only for a lapsed lifter', () => {
    expect(latestTrainedDate(['2026-10-02', '2026-10-18', '2026-10-25'], TODAY)).toBe('2026-10-18');
    expect(latestTrainedDate(['2026-10-25'], TODAY)).toBeNull();
    expect(latestTrainedDate([], TODAY)).toBeNull();
  });
});
