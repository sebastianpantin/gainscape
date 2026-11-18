import { describe, expect, it } from 'vitest';
import { characterPose, characterPoseFrom } from '../../web/src/features/workout/character-pose-rules.ts';

const TODAY = '2026-10-21';

describe('characterPose', () => {
  it('lifts on a day with a workout', () => {
    expect(characterPose(TODAY, TODAY, null)).toBe('lifting');
    expect(characterPose(TODAY, TODAY, '2026-10-19')).toBe('lifting');
  });

  it('flexes on a day with a record', () => {
    expect(characterPose(TODAY, TODAY, TODAY)).toBe('flexing');
  });

  it('stands idle for a few days after a workout', () => {
    expect(characterPose(TODAY, '2026-10-20', '2026-10-20')).toBe('idle');
    expect(characterPose(TODAY, '2026-10-18', null)).toBe('idle');
  });

  it('rests from the fourth day without a workout, as the pet gets sleepy', () => {
    expect(characterPose(TODAY, '2026-10-17', null)).toBe('resting');
    expect(characterPose(TODAY, '2026-06-01', '2026-06-01')).toBe('resting');
  });

  it('stands idle before the first workout, so a new lifter is not greeted asleep', () => {
    expect(characterPose(TODAY, null, null)).toBe('idle');
  });

  it('treats a workout or record dated after today, from another device clock, as today', () => {
    expect(characterPose(TODAY, '2026-10-22', null)).toBe('lifting');
    expect(characterPose(TODAY, '2026-10-22', '2026-10-22')).toBe('flexing');
  });
});

describe('characterPoseFrom', () => {
  it('stands idle until the local day, the last workout and the records are known', () => {
    expect(characterPoseFrom(null, TODAY, [TODAY])).toBe('idle');
    expect(characterPoseFrom(TODAY, undefined, [TODAY])).toBe('idle');
    expect(characterPoseFrom(TODAY, TODAY, undefined)).toBe('idle');
  });

  it('reads the newest record day', () => {
    expect(characterPoseFrom(TODAY, TODAY, ['2026-10-02', TODAY, '2026-10-11'])).toBe('flexing');
    expect(characterPoseFrom(TODAY, TODAY, ['2026-10-02', '2026-10-11'])).toBe('lifting');
    expect(characterPoseFrom(TODAY, TODAY, [])).toBe('lifting');
    expect(characterPoseFrom(TODAY, null, [])).toBe('idle');
  });
});
