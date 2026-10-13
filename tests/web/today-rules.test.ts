import { levelProgress } from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import type { Skill } from '../../web/src/lib/catalog-rules.ts';
import {
  greetingFor,
  levelCountStart,
  nearestLevelUp,
  nearestLevelUpText,
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

describe('levelCountStart', () => {
  it('counts up from the level last seen on this device', () => {
    expect(levelCountStart(31, 34)).toBe(31);
  });

  it('shows the level at once when nothing was seen yet or it did not rise', () => {
    expect(levelCountStart(null, 34)).toBe(34);
    expect(levelCountStart(34, 34)).toBe(34);
    expect(levelCountStart(40, 34)).toBe(34);
  });
});

describe('nearestLevelUp', () => {
  it('picks the trained skill with the fewest XP to its next level', () => {
    const legs = standing('legs', 'Legs', levelProgress(0).nextLevelXp! - 10);
    const chest = standing('chest', 'Chest', 50);
    expect(nearestLevelUp([chest, legs])).toEqual({ skillName: 'Legs', xpToGo: 10, nextLevel: 2 });
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
    expect(nearestLevelUpText({ skillName: 'Legs', xpToGo: 1312, nextLevel: 41 })).toBe(
      'Legs is 1,312 XP from level 41',
    );
  });
});

describe('streakRiskText', () => {
  const monday = new Date(2026, 9, 12, 9);
  const tuesday = new Date(2026, 9, 13, 9);
  const friday = new Date(2026, 9, 16, 9);
  const sunday = new Date(2026, 9, 18, 20);
  const nextMonday = new Date(2026, 9, 19, 9);
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
