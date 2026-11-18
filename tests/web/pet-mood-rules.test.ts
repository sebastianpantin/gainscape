import { describe, expect, it } from 'vitest';
import {
  lastTrainedDateFrom,
  petCompanionLabel,
  petMood,
  petMoodFrom,
} from '../../web/src/features/workout/pet-mood-rules.ts';

const TODAY = '2026-10-21';

describe('petMood', () => {
  it('is excited on a day with a workout', () => {
    expect(petMood(TODAY, TODAY)).toBe('excited');
  });

  it('stays content for a few days after a workout', () => {
    expect(petMood(TODAY, '2026-10-20')).toBe('content');
    expect(petMood(TODAY, '2026-10-18')).toBe('content');
  });

  it('gets sleepy from the fourth day without a workout', () => {
    expect(petMood(TODAY, '2026-10-17')).toBe('sleepy');
    expect(petMood(TODAY, '2026-06-01')).toBe('sleepy');
  });

  it('is sleepy when no workout was ever logged', () => {
    expect(petMood(TODAY, null)).toBe('sleepy');
  });

  it('counts calendar days across a month end and a daylight saving change', () => {
    expect(petMood('2026-11-01', '2026-10-29')).toBe('content');
    expect(petMood('2026-11-01', '2026-10-28')).toBe('sleepy');
    expect(petMood('2026-10-26', '2026-10-23')).toBe('content');
    expect(petMood('2026-03-30', '2026-03-26')).toBe('sleepy');
  });

  it('treats a workout dated after today, from another device clock, as today', () => {
    expect(petMood(TODAY, '2026-10-22')).toBe('excited');
  });
});

describe('lastTrainedDateFrom', () => {
  it('is unknown until the local day and the training days are known', () => {
    expect(lastTrainedDateFrom(null, [TODAY], null)).toBeUndefined();
    expect(lastTrainedDateFrom(TODAY, undefined, null)).toBeUndefined();
  });

  it('reads the newest training day up to today', () => {
    expect(lastTrainedDateFrom(TODAY, ['2026-10-02', TODAY, '2026-10-25'], undefined)).toBe(TODAY);
    expect(lastTrainedDateFrom(TODAY, ['2026-10-02', '2026-10-19'], '2026-08-21')).toBe('2026-10-19');
  });

  it('waits for the older workout lookup when the training days hold none', () => {
    expect(lastTrainedDateFrom(TODAY, [], undefined)).toBeUndefined();
    expect(lastTrainedDateFrom(TODAY, [], '2026-08-21')).toBe('2026-08-21');
    expect(lastTrainedDateFrom(TODAY, [], null)).toBeNull();
  });
});

describe('petMoodFrom', () => {
  it('has no mood until the local day and the last workout are known', () => {
    expect(petMoodFrom(null, TODAY)).toBeNull();
    expect(petMoodFrom(TODAY, undefined)).toBeNull();
  });

  it('reads the mood from the last workout', () => {
    expect(petMoodFrom(TODAY, TODAY)).toBe('excited');
    expect(petMoodFrom(TODAY, '2026-10-19')).toBe('content');
    expect(petMoodFrom(TODAY, '2026-08-21')).toBe('sleepy');
    expect(petMoodFrom(TODAY, null)).toBe('sleepy');
  });
});

describe('petCompanionLabel', () => {
  it('names the pet and its mood', () => {
    expect(petCompanionLabel('Bones', 'sleepy')).toBe('Bones, your companion, sleepy');
    expect(petCompanionLabel('Spotter Pup', 'excited')).toBe('Spotter Pup, your companion, excited');
    expect(petCompanionLabel('Bones', 'content')).toBe('Bones, your companion, happy');
  });

  it('leaves the mood out while it is unknown', () => {
    expect(petCompanionLabel('Bones', null)).toBe('Bones, your companion');
  });
});
