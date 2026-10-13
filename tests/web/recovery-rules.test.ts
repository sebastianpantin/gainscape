import { describe, expect, it } from 'vitest';
import {
  hardSetLoad,
  recoveryBySkill,
  recoveryGroups,
  recoveryState,
  type RecentSet,
  rirForRecovery,
} from '../../web/src/lib/progress/recovery-rules.ts';

const NOW = Date.parse('2026-10-13T12:00:00.000Z');

const SHARES = new Map([
  ['press', [{ skillKey: 'chest', shareBasisPoints: 10_000 }]],
  [
    'bench',
    [
      { skillKey: 'chest', shareBasisPoints: 6_000 },
      { skillKey: 'arms', shareBasisPoints: 2_500 },
      { skillKey: 'shoulders', shareBasisPoints: 1_500 },
    ],
  ],
  ['run', [{ skillKey: 'endurance', shareBasisPoints: 10_000 }]],
]);

function sets(count: number, exerciseId: string, hoursAgo: number, rir = 0): RecentSet[] {
  const endedAt = new Date(NOW - hoursAgo * 3_600_000).toISOString();
  return Array.from({ length: count }, () => ({ exerciseId, endedAt, rir }));
}

describe('hardSetLoad', () => {
  it('counts a set taken to failure as one hard set for each muscle it trains, split by share', () => {
    const load = hardSetLoad(sets(6, 'bench', 0), SHARES, NOW);
    expect(load.chest).toBeCloseTo(3.6);
    expect(load.arms).toBeCloseTo(1.5);
    expect(load.shoulders).toBeCloseTo(0.9);
    expect(load.legs).toBe(0);
  });

  it('weights easier sets less, by how close to failure they were', () => {
    expect(hardSetLoad(sets(6, 'press', 0, 5), SHARES, NOW).chest).toBeCloseTo(1);
    expect(hardSetLoad(sets(3, 'press', 0, 3), SHARES, NOW).chest).toBeCloseTo(1.5);
  });

  it('halves the load every 36 hours', () => {
    expect(hardSetLoad(sets(4, 'press', 36), SHARES, NOW).chest).toBeCloseTo(2);
    expect(hardSetLoad(sets(4, 'press', 72), SHARES, NOW).chest).toBeCloseTo(1);
  });

  it('treats a workout that ends in the future as ending now', () => {
    expect(hardSetLoad(sets(2, 'press', -5), SHARES, NOW).chest).toBeCloseTo(2);
  });

  it('ignores unknown exercises and skills that are not body parts', () => {
    const load = hardSetLoad([...sets(3, 'gone', 0), ...sets(3, 'run', 0)], SHARES, NOW);
    expect(Object.values(load)).toEqual(Array(7).fill(0));
    expect(load).not.toHaveProperty('endurance');
  });
});

describe('rirForRecovery', () => {
  it('uses the logged RIR when there is one', () => {
    expect(rirForRecovery(1.5, 'logged')).toBe(1.5);
    expect(rirForRecovery('0.5', 'logged')).toBe(0.5);
  });

  it('assumes what the server assumes when no effort was logged', () => {
    expect(rirForRecovery(null, 'cold_start')).toBe(2);
    expect(rirForRecovery(null, 'default')).toBe(3);
  });
});

describe('recoveryState', () => {
  it('is recovering from one hard set left, easing from 0.4, otherwise fresh', () => {
    expect(recoveryState(1)).toBe('recovering');
    expect(recoveryState(0.999)).toBe('easing');
    expect(recoveryState(0.4)).toBe('easing');
    expect(recoveryState(0.399)).toBe('fresh');
    expect(recoveryState(0)).toBe('fresh');
  });
});

describe('recoveryBySkill', () => {
  it('keeps a hard-hit muscle recovering longer than a lightly trained one', () => {
    const states = recoveryBySkill(sets(6, 'bench', 50), SHARES, NOW);
    expect(states.chest).toBe('recovering');
    expect(states.arms).toBe('easing');
    expect(states.shoulders).toBe('fresh');
  });

  it('keeps six sets to failure recovering for about four days and easing for two more', () => {
    expect(recoveryBySkill(sets(6, 'press', 93), SHARES, NOW).chest).toBe('recovering');
    expect(recoveryBySkill(sets(6, 'press', 94), SHARES, NOW).chest).toBe('easing');
    expect(recoveryBySkill(sets(6, 'press', 140), SHARES, NOW).chest).toBe('easing');
    expect(recoveryBySkill(sets(6, 'press', 141), SHARES, NOW).chest).toBe('fresh');
  });

  it('is fresh everywhere without recent sets', () => {
    expect(Object.values(recoveryBySkill([], SHARES, NOW))).toEqual(Array(7).fill('fresh'));
  });
});

describe('recoveryGroups', () => {
  it('lists skill names by state in body order', () => {
    const states = recoveryBySkill([...sets(6, 'press', 0), ...sets(6, 'bench', 0)], SHARES, NOW);
    expect(recoveryGroups(states, (key) => key.toUpperCase())).toEqual({
      recovering: ['CHEST', 'ARMS'],
      easing: ['SHOULDERS'],
      fresh: ['BACK', 'LEGS', 'CORE', 'GRIP'],
    });
  });
});
