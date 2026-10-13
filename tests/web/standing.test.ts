import { combatLevel, levelForXp, xpForLevel } from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import type { Skill } from '../../web/src/lib/exercises/catalog-rules.ts';
import { monogramFor, standingFrom } from '../../web/src/lib/progress/standing-rules.ts';

const skills: Skill[] = [
  { id: 'chest-id', key: 'chest', name: 'Chest', sortOrder: 1, combatWeight: 1, modality: 'lift' },
  { id: 'legs-id', key: 'legs', name: 'Legs', sortOrder: 2, combatWeight: 2, modality: 'lift' },
  { id: 'running-id', key: 'running', name: 'Running', sortOrder: 3, combatWeight: 0, modality: 'cardio' },
];

describe('monogramFor', () => {
  it('uses the fixed monogram of a known skill', () => {
    expect(monogramFor('chest')).toBe('CH');
    expect(monogramFor('back')).toBe('BK');
    expect(monogramFor('legs')).toBe('LG');
  });

  it('falls back to the first two letters, upper case', () => {
    expect(monogramFor('running')).toBe('RU');
  });
});

describe('standingFrom', () => {
  it('gives every skill its level progress, treating missing XP as zero', () => {
    const standing = standingFrom(skills, new Map([['legs-id', xpForLevel(10)]]));
    expect(standing.skills.map(({ skill, progress }) => [skill.key, progress.level, progress.xp])).toEqual([
      ['chest', levelForXp(0), 0],
      ['legs', 10, xpForLevel(10)],
      ['running', levelForXp(0), 0],
    ]);
  });

  it('sums the levels and weights combat by each skill', () => {
    const standing = standingFrom(
      skills,
      new Map([
        ['chest-id', xpForLevel(5)],
        ['legs-id', xpForLevel(20)],
        ['running-id', xpForLevel(40)],
      ]),
    );
    expect(standing.totalLevel).toBe(65);
    expect(standing.combatLevel).toBe(
      combatLevel([
        { level: 5, weight: 1 },
        { level: 20, weight: 2 },
        { level: 40, weight: 0 },
      ]),
    );
  });
});
