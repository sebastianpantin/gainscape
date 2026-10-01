import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, effectiveReps, effortInputFromStored, resolveEffort, setXp, splitXp } from '@domain/index.ts';
import { TEST_BALANCE } from './fixtures.ts';

describe('effort', () => {
  it.each([
    ['easy', 5],
    ['hard', 3],
    ['near_failure', 1],
    ['failure', 0],
  ] as const)('%s maps to RIR %i', (level, rir) => {
    expect(resolveEffort({ type: 'level', level }, DEFAULT_BALANCE)).toEqual({
      effortInputType: 'level',
      effortValue: rir,
      loggedRir: rir,
    });
  });

  it('gives an easy set one effective rep', () => {
    const { loggedRir } = resolveEffort({ type: 'level', level: 'easy' }, DEFAULT_BALANCE);
    expect(effectiveReps(10, loggedRir!, false, DEFAULT_BALANCE)).toBe(1);
  });

  it('reads a stored easy level back from its RIR', () => {
    expect(effortInputFromStored('level', 5, DEFAULT_BALANCE)).toEqual({ type: 'level', level: 'easy' });
  });

  it('leaves an unrated set without a logged RIR', () => {
    expect(resolveEffort(null, DEFAULT_BALANCE)).toEqual({ effortInputType: null, effortValue: null, loggedRir: null });
  });

  it('converts RPE to RIR', () => {
    expect(resolveEffort({ type: 'rpe', value: 8 }, DEFAULT_BALANCE).loggedRir).toBe(2);
  });

  it('rejects RIR outside half steps', () => {
    expect(() => resolveEffort({ type: 'rir', value: 1.3 }, DEFAULT_BALANCE)).toThrow(RangeError);
  });
});

describe('effective reps', () => {
  it.each([
    [12, 1, 5],
    [3, 1, 3],
    [8, 3, 3],
    [8, 0, 6],
    [8, 5, 1],
    [8, 6, 0],
  ])('%i reps at RIR %i gives %i effective reps', (reps, rir, expected) => {
    expect(effectiveReps(reps, rir, false, TEST_BALANCE)).toBe(expected);
  });

  it('gives warm-ups no effective reps', () => {
    expect(effectiveReps(10, 0, true, DEFAULT_BALANCE)).toBe(0);
  });

  it('awards XP per effective rep', () => {
    expect(setXp(3, 1, TEST_BALANCE)).toBe(30);
  });
});

describe('xp split', () => {
  const benchShares = [
    { skillId: 'chest', shareBasisPoints: 7000, sortOrder: 1 },
    { skillId: 'shoulders', shareBasisPoints: 2000, sortOrder: 3 },
    { skillId: 'arms', shareBasisPoints: 1000, sortOrder: 4 },
  ];

  it('splits by shares', () => {
    expect(splitXp(30, benchShares)).toEqual([
      { skillId: 'chest', xp: 21 },
      { skillId: 'shoulders', xp: 6 },
      { skillId: 'arms', xp: 3 },
    ]);
  });

  it('always sums to the set XP', () => {
    for (let xp = 0; xp <= 500; xp++) {
      const total = splitXp(xp, benchShares).reduce((sum, part) => sum + part.xp, 0);
      expect(total).toBe(xp);
    }
  });

  it('rejects shares that do not sum to 10000', () => {
    expect(() => splitXp(10, [{ skillId: 'chest', shareBasisPoints: 9000, sortOrder: 1 }])).toThrow(RangeError);
  });

  it('gives tied remainders to the lower sort order', () => {
    const evenSplit = [
      { skillId: 'legs', shareBasisPoints: 5000, sortOrder: 5 },
      { skillId: 'back', shareBasisPoints: 5000, sortOrder: 2 },
    ];
    expect(splitXp(1, evenSplit)).toEqual([{ skillId: 'back', xp: 1 }]);
  });

  it('rotates tied remainders so no skill loses XP over repeated sets', () => {
    expect(splitXp(375, benchShares, 0)).toEqual([
      { skillId: 'chest', xp: 263 },
      { skillId: 'shoulders', xp: 75 },
      { skillId: 'arms', xp: 37 },
    ]);
    expect(splitXp(375, benchShares, 1)).toEqual([
      { skillId: 'chest', xp: 262 },
      { skillId: 'shoulders', xp: 75 },
      { skillId: 'arms', xp: 38 },
    ]);
  });

  it('matches the exact share over a full rotation of tied remainders', () => {
    const totals = { chest: 0, shoulders: 0, arms: 0 } as Record<string, number>;
    for (let rotation = 0; rotation < 6; rotation++) {
      for (const part of splitXp(375, benchShares, rotation)) totals[part.skillId] += part.xp;
    }
    expect(totals).toEqual({ chest: 1575, shoulders: 450, arms: 225 });
  });
});
