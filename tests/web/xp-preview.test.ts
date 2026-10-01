import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, epley, intensityBonus, setXp } from '@domain/index.ts';
import { previewSet, type PreviewExercise } from '../../web/src/features/workout/xp-preview.ts';

const failure = { type: 'level', level: 'failure' } as const;
const bench = (e1rmKg: number | null): PreviewExercise => ({
  loadType: 'external',
  builtIn: true,
  strength: e1rmKg === null ? null : { e1rmKg, repsCapacity: null },
});
const draft = (weightKg: number, reps: number, effort: typeof failure | null) => ({
  id: 'set',
  weightKg,
  reps,
  effort,
  done: true,
});

describe('previewSet', () => {
  it('previews no XP for a zero external load', () => {
    expect(previewSet(draft(0, 6, failure), bench(100), true).xp).toBe(0);
  });

  it('previews no cold-start XP for a zero external load', () => {
    expect(previewSet(draft(0, 6, null), bench(null), true)).toMatchObject({ xp: 0, basis: 'cold_start' });
  });

  it('previews the rep-based intensity bonus for a logged set', () => {
    const e1rmKg = epley(100, 6);
    const expected = setXp(6, intensityBonus(6, 100, e1rmKg, DEFAULT_BALANCE), DEFAULT_BALANCE);
    expect(previewSet(draft(100, 6, failure), bench(e1rmKg), true)).toMatchObject({ xp: expected, basis: 'logged' });
  });
});
