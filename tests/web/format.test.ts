import { describe, expect, it } from 'vitest';
import { formatLoad, formatSessionDate, formatXp, sessionGearBonus, sessionXp } from '../../web/src/lib/format.ts';

describe('formatLoad', () => {
  it('shows an external load in the chosen unit, kilograms by default', () => {
    expect(formatLoad(100, 'external')).toBe('100 kg');
    expect(formatLoad(100, 'external', 'lb')).toBe('220.5 lb');
  });

  it('marks added weight on bodyweight exercises with a plus', () => {
    expect(formatLoad(20, 'bodyweight_plus', 'kg')).toBe('+20 kg');
    expect(formatLoad(20, 'bodyweight_plus', 'lb')).toBe('+44.1 lb');
  });

  it('shows a bodyweight load as a plain weight', () => {
    expect(formatLoad(0, 'bodyweight', 'kg')).toBe('0 kg');
  });
});

describe('formatXp', () => {
  it('groups thousands with commas', () => {
    expect(formatXp(0)).toBe('0');
    expect(formatXp(1234567)).toBe('1,234,567');
  });
});

describe('sessionXp', () => {
  it('adds up the XP of every skill and treats a missing map as none', () => {
    expect(sessionXp({ xpBySkill: { legs: 300, core: 45 } })).toBe(345);
    expect(sessionXp({ xpBySkill: {} })).toBe(0);
    expect(sessionXp({ xpBySkill: undefined as unknown as Record<string, number> })).toBe(0);
  });
});

describe('sessionGearBonus', () => {
  it('adds up the gear bonus of every skill', () => {
    expect(sessionGearBonus({ gearBonusBySkill: { core: 100, legs: 7 } })).toBe(107);
  });

  it('is 0 for a summary without a gear bonus', () => {
    expect(sessionGearBonus({})).toBe(0);
    expect(sessionGearBonus({ gearBonusBySkill: {} })).toBe(0);
  });
});

describe('formatSessionDate', () => {
  it('shows the local date of a workout with weekday, day, month and year', () => {
    expect(formatSessionDate('2026-10-01')).toBe('Thu, 1 Oct 2026');
  });
});
