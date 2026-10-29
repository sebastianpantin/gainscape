import { levelProgress } from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import { localDateIn } from '../../web/src/lib/ui/date-bucket-rules.ts';
import type { Skill } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  greetingFor,
  nearestLevelUp,
  nearestLevelUpText,
  nearestLevelUpValueText,
  streakRiskText,
} from '../../web/src/features/workout/today-rules.ts';

function skill(key: string, name: string): Skill {
  return { id: key, key, name } as Skill;
}

function standing(key: string, name: string, xp: number) {
  return { skill: skill(key, name), progress: levelProgress(xp) };
}

describe('greetingFor', () => {
  it('follows the time of day', () => {
    expect(greetingFor(6)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good afternoon');
    expect(greetingFor(18)).toBe('Good evening');
    expect(greetingFor(22)).toBe('Good evening');
    expect(greetingFor(23)).toBe('Late one tonight');
    expect(greetingFor(4)).toBe('Late one tonight');
    expect(greetingFor(5)).toBe('Good morning');
  });
});

describe('nearestLevelUp', () => {
  it('picks the trained skill with the fewest XP to its next level', () => {
    const legs = standing('legs', 'Legs', levelProgress(0).nextLevelXp! - 10);
    const chest = standing('chest', 'Chest', 50);
    const levelTwoXp = levelProgress(0).nextLevelXp!;
    expect(nearestLevelUp([chest, legs])).toEqual({
      skillKey: 'legs',
      skillName: 'Legs',
      xp: levelTwoXp - 10,
      xpToGo: 10,
      nextLevel: 2,
      xpIntoLevel: levelTwoXp - 10,
      levelXp: levelTwoXp,
    });
  });

  it('ignores untrained skills', () => {
    expect(nearestLevelUp([standing('core', 'Core', 0)])).toBeNull();
  });

  it('ignores skills at the level cap', () => {
    expect(nearestLevelUp([standing('arms', 'Arms', 200_000_000)])).toBeNull();
  });
});

describe('nearestLevelUpText', () => {
  it('names the skill, the XP left and the next level', () => {
    expect(
      nearestLevelUpText({
        skillKey: 'legs',
        skillName: 'Legs',
        xp: 1000,
        xpToGo: 1312,
        nextLevel: 41,
        xpIntoLevel: 0,
        levelXp: 1312,
      }),
    ).toBe('Legs is 1,312 XP from level 41');
  });
});

describe('nearestLevelUpValueText', () => {
  it('reads the XP into the level against the XP the level needs', () => {
    expect(
      nearestLevelUpValueText({
        skillKey: 'legs',
        skillName: 'Legs',
        xp: 1000,
        xpToGo: 312,
        nextLevel: 41,
        xpIntoLevel: 1000,
        levelXp: 1312,
      }),
    ).toBe('1,000 of 1,312 XP');
  });
});

describe('streakRiskText', () => {
  const monday = '2026-10-12';
  const tuesday = '2026-10-13';
  const friday = '2026-10-16';
  const sunday = '2026-10-18';
  const nextMonday = '2026-10-19';
  const status = { weekStart: '2026-10-12', goal: 3, sessionsThisWeek: 1, streakWeeks: 4, nextGoal: null };

  it('warns when the workouts left fill the days left', () => {
    expect(streakRiskText({ ...status, sessionsThisWeek: 0 }, friday)).toBe(
      '3 more workouts by Sunday keeps your 4 week streak',
    );
  });

  it('warns with one spare day', () => {
    expect(streakRiskText(status, friday)).toBe('2 more workouts by Sunday keeps your 4 week streak');
  });

  it('still warns when the workouts left outnumber the days left', () => {
    expect(streakRiskText(status, sunday)).toBe('2 more workouts today keeps your 4 week streak');
  });

  it('stays quiet with room to spare', () => {
    expect(streakRiskText(status, tuesday)).toBeNull();
  });

  it('stays quiet before the last three days, even for a big goal', () => {
    expect(streakRiskText({ ...status, goal: 7, sessionsThisWeek: 0 }, monday)).toBeNull();
    expect(streakRiskText({ ...status, goal: 6, sessionsThisWeek: 0 }, tuesday)).toBeNull();
  });

  it('stays quiet when the goal would take more than two workouts a day', () => {
    expect(streakRiskText({ ...status, goal: 7, sessionsThisWeek: 0 }, friday)).toBeNull();
    expect(streakRiskText({ ...status, goal: 4, sessionsThisWeek: 1 }, sunday)).toBeNull();
  });

  it('stays quiet once the goal is met', () => {
    expect(streakRiskText({ ...status, sessionsThisWeek: 3 }, sunday)).toBeNull();
  });

  it('counts the days left from the profile day, not the device day', () => {
    const saturdayEveningInUtc = Date.parse('2026-10-17T20:00:00Z');
    const profileToday = localDateIn('Pacific/Auckland', saturdayEveningInUtc);
    expect(profileToday).toBe(sunday);
    const deviceToday = localDateIn('America/Los_Angeles', saturdayEveningInUtc);
    expect(deviceToday).toBe('2026-10-17');
    expect(streakRiskText({ ...status, goal: 2 }, profileToday)).toBe('1 more workout today keeps your 4 week streak');
    expect(streakRiskText({ ...status, goal: 2 }, deviceToday)).toBe(
      '1 more workout by Sunday keeps your 4 week streak',
    );
  });

  it('stays quiet when the status is from another week than today', () => {
    expect(streakRiskText(status, nextMonday)).toBeNull();
    expect(streakRiskText({ ...status, weekStart: '2026-10-19' }, sunday)).toBeNull();
  });

  it('talks about the goal when there is no streak yet', () => {
    expect(streakRiskText({ ...status, sessionsThisWeek: 2, streakWeeks: 0 }, sunday)).toBe(
      '1 more workout today hits your weekly goal',
    );
  });

  it('stays quiet without a goal', () => {
    expect(streakRiskText({ ...status, goal: null }, friday)).toBeNull();
  });
});
