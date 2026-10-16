import { describe, expect, it } from 'vitest';
import { bodySummaryText } from '../../web/src/lib/progress/body-summary-rules.ts';
import { BODY_SKILLS, type BodySkill } from '../../web/src/lib/progress/recovery-rules.ts';
import { type MuscleVolume, volumeBand } from '../../web/src/lib/progress/weekly-volume-rules.ts';

function bySkill<T>(value: (skill: BodySkill) => T): Record<BodySkill, T> {
  return Object.fromEntries(BODY_SKILLS.map((skill) => [skill, value(skill)])) as Record<BodySkill, T>;
}

function volumeOf(sets: Partial<Record<BodySkill, number>>): Record<BodySkill, MuscleVolume> {
  return bySkill((skill) => {
    const total = sets[skill] ?? 0;
    return { sets: total, band: volumeBand(total), contributions: [] };
  });
}

const RESTED = bySkill(() => 0);
const ON_TARGET = volumeOf(Object.fromEntries(BODY_SKILLS.map((skill) => [skill, 12])));

describe('bodySummaryText', () => {
  it('counts muscles still recovering and muscles that reached the weekly set target', () => {
    const load = { ...RESTED, chest: 3, back: 1, arms: 0.5 };
    const volume = volumeOf({ chest: 12, back: 25, shoulders: 10, arms: 20 });
    expect(bodySummaryText(load, volume)).toBe('2 recovering · 4 of 7 at target');
  });

  it('names muscles that are only almost fresh the way the Recovery legend does', () => {
    expect(bodySummaryText({ ...RESTED, arms: 0.5, legs: 0.6 }, ON_TARGET)).toBe('2 almost fresh · 7 of 7 at target');
  });

  it('says so when every muscle is fresh and every muscle reached the target', () => {
    expect(bodySummaryText(RESTED, ON_TARGET)).toBe('All fresh · 7 of 7 at target');
  });

  it('shows the half that has loaded on its own', () => {
    expect(bodySummaryText({ ...RESTED, legs: 2 }, null)).toBe('1 recovering');
    expect(bodySummaryText(null, volumeOf({}))).toBe('0 of 7 at target');
    expect(bodySummaryText(null, ON_TARGET)).toBe('7 of 7 at target');
  });

  it('has no summary until something has loaded', () => {
    expect(bodySummaryText(null, null)).toBeNull();
  });
});
