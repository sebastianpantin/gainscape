import { describe, expect, it } from 'vitest';
import { combatLevel, levelForXp, levelProgress, MAX_LEVEL, xpForLevel } from '@domain/index.ts';

describe('xp curve', () => {
  it.each([
    [1, 0],
    [2, 80],
    [3, 167],
    [10, 980],
    [30, 7_345],
    [50, 32_619],
    [70, 133_230],
    [92, 614_489],
    [99, 998_458],
  ])('level %i requires %i xp', (level, xp) => {
    expect(xpForLevel(level)).toBe(xp);
  });

  it('maps every level threshold back to its level', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      if (level > 1) expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it('never exceeds the max level', () => {
    expect(levelForXp(200_000_000)).toBe(99);
  });

  it('reports progress towards the next level', () => {
    expect(levelProgress(135)).toMatchObject({ level: 2, levelStartXp: 80, nextLevelXp: 167 });
    expect(levelProgress(998_458)).toMatchObject({ level: 99, nextLevelXp: null, fractionToNextLevel: 1 });
  });
});

describe('combat level', () => {
  const weights = [2, 2, 2, 1, 2, 1];
  const atLevel = (level: number) => weights.map((weight) => ({ weight, level }));

  it('is 3 when every skill is level 1', () => {
    expect(combatLevel(atLevel(1))).toBe(3);
  });

  it('is 126 when every skill is level 99', () => {
    expect(combatLevel(atLevel(99))).toBe(126);
  });

  it('weights skills by combat weight', () => {
    const legsAtTwo = weights.map((weight, index) => ({ weight, level: index === 4 ? 2 : 1 }));
    expect(combatLevel(legsAtTwo)).toBe(3);
  });
});
