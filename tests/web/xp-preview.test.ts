import { describe, expect, it } from 'vitest';
import {
  type Catalog,
  DEFAULT_BALANCE,
  effectiveLoadForNewSet,
  epley,
  type ExerciseStrength,
  intensityBonus,
  processSession,
  setXp,
} from '@domain/index.ts';
import type { LoadType } from '../../web/src/lib/catalog.ts';
import type { DraftExercise, DraftSet } from '../../web/src/offline/draft-format.ts';
import { previewSession } from '../../web/src/features/workout/xp-preview.ts';

const failure = { type: 'level', level: 'failure' } as const;

let setCounter = 0;

function draftSet(weightKg: number, reps: number, effort: DraftSet['effort'], done = true): DraftSet {
  setCounter += 1;
  return { id: `set-${setCounter}`, weightKg, reps, effort, done };
}

function exercise(exerciseId: string, sets: DraftSet[], loadType: LoadType = 'external'): DraftExercise {
  return { exerciseId, name: exerciseId, loadType, target: null, sets };
}

function strengthOf(entries: [string, number | null][]): Record<string, ExerciseStrength> {
  return Object.fromEntries(
    entries.map(([exerciseId, windowMax]) => [exerciseId, { windowMax, fallbackMax: null, hasPriorSession: true }]),
  );
}

const builtIn = () => true;

function totalXp(previews: ReturnType<typeof previewSession>): number {
  return previews.flat().reduce((sum, preview) => sum + preview.xp, 0);
}

describe('previewSession', () => {
  it('previews no XP for a zero external load', () => {
    const previews = previewSession(
      [exercise('bench', [draftSet(0, 6, failure)])],
      builtIn,
      strengthOf([['bench', 100]]),
    );
    expect(previews[0][0].xp).toBe(0);
  });

  it('previews the rep-based intensity bonus for a logged set', () => {
    const e1rmKg = epley(100, 6);
    const previews = previewSession(
      [exercise('bench', [draftSet(100, 6, failure)])],
      builtIn,
      strengthOf([['bench', e1rmKg]]),
    );
    const expected = setXp(6, intensityBonus(6, 100, e1rmKg, DEFAULT_BALANCE), DEFAULT_BALANCE);
    expect(previews[0][0]).toMatchObject({ xp: expected, basis: 'logged', rir: 0 });
  });

  it('pays cold-start XP for at most 8 sets of a first-time exercise', () => {
    const sets = Array.from({ length: 10 }, () => draftSet(60, 8, null));
    const previews = previewSession([exercise('bench', sets)], builtIn, strengthOf([]));
    expect(previews[0].map((preview) => preview.xp)).toEqual([
      ...Array.from({ length: 8 }, () => DEFAULT_BALANCE.coldStartXpPerSet),
      0,
      0,
    ]);
    expect(previews[0][0].basis).toBe('cold_start');
  });

  it('lowers the XP of repeated sets that all claim failure', () => {
    const sets = Array.from({ length: 10 }, () => draftSet(100, 6, failure));
    const previews = previewSession([exercise('bench', sets)], builtIn, strengthOf([['bench', epley(100, 6)]]));
    expect(previews[0][0].xp).toBeLessThan(previews[0][9].xp);
  });

  it('gives a flagged claim no intensity bonus', () => {
    const previews = previewSession(
      [exercise('bench', [draftSet(80, 3, failure)])],
      builtIn,
      strengthOf([['bench', 100]]),
    );
    expect(previews[0][0].xp).toBe(setXp(3, 1, DEFAULT_BALANCE));
  });

  it('lets only done sets affect the XP of done sets', () => {
    const done = draftSet(100, 6, failure);
    const planned = Array.from({ length: 9 }, () => draftSet(100, 6, failure, false));
    const strength = strengthOf([['bench', epley(100, 6)]]);
    const alone = previewSession([exercise('bench', [done])], builtIn, strength);
    const withPlanned = previewSession([exercise('bench', [done, ...planned])], builtIn, strength);
    expect(withPlanned[0][0].xp).toBe(alone[0][0].xp);
  });

  it('previews a planned set as if it were done', () => {
    const strength = strengthOf([['bench', 120]]);
    const previews = previewSession(
      [exercise('bench', [draftSet(100, 5, null), draftSet(100, 5, null, false)])],
      builtIn,
      strength,
    );
    const bothDone = previewSession(
      [exercise('bench', [draftSet(100, 5, null), draftSet(100, 5, null)])],
      builtIn,
      strength,
    );
    expect(previews[0][1]).toEqual(bothDone[0][1]);
  });

  it('marks unrated sets unknown until strength has loaded', () => {
    const previews = previewSession([exercise('bench', [draftSet(60, 8, null)])], builtIn, null);
    expect(previews[0][0]).toEqual({ xp: 0, basis: 'unknown', rir: null });
  });

  it('pays nothing for an unrated set on a custom exercise the first time', () => {
    const previews = previewSession([exercise('mine', [draftSet(60, 8, null)])], () => false, strengthOf([]));
    expect(previews[0][0].xp).toBe(0);
  });

  it('marks a pure bodyweight set with added load unknown instead of throwing', () => {
    const previews = previewSession(
      [exercise('pull-up', [draftSet(10, 8, failure)], 'bodyweight')],
      builtIn,
      strengthOf([]),
      80,
    );
    expect(previews[0][0]).toEqual({ xp: 0, basis: 'unknown', rir: null });
  });

  it('previews a bodyweight set against reps capacity', () => {
    const previews = previewSession(
      [exercise('pull-up', [draftSet(0, 8, null)], 'bodyweight')],
      builtIn,
      strengthOf([['pull-up', 12]]),
    );
    expect(previews[0][0]).toMatchObject({ basis: 'estimated', rir: 4 });
  });

  it('sums done sets the same way the server awards them across exercises', () => {
    const previews = previewSession(
      [
        exercise('bench', [draftSet(100, 6, failure), draftSet(100, 5, failure)]),
        exercise('squat', [draftSet(140, 5, { type: 'rir', value: 2 })]),
      ],
      builtIn,
      strengthOf([
        ['bench', 120],
        ['squat', 170],
      ]),
    );
    expect(totalXp(previews)).toBeGreaterThan(0);
    expect(previews.map((sets) => sets.length)).toEqual([2, 1]);
  });
  it('pays no cold-start XP for an exercise trained before without an e1RM', () => {
    const previews = previewSession(
      [exercise('curl', [draftSet(20, 15, null)])],
      builtIn,
      strengthOf([['curl', null]]),
    );
    expect(previews[0][0].xp).toBe(0);
  });

  it('estimates from the session best when only an expired e1RM is known', () => {
    const strength = { bench: { windowMax: null, fallbackMax: 100, hasPriorSession: true } };
    const previews = previewSession(
      [exercise('bench', [draftSet(50, 5, { type: 'level', level: 'hard' }), draftSet(50, 5, null)])],
      builtIn,
      strength,
    );
    expect(previews[0][1]).toMatchObject({ basis: 'estimated', rir: 3 });
  });

  it('adds bodyweight to a weighted bodyweight exercise', () => {
    const previews = previewSession(
      [exercise('dip', [draftSet(0, 8, failure)], 'bodyweight_plus')],
      builtIn,
      strengthOf([['dip', epley(80, 8)]]),
      80,
    );
    expect(previews[0][0]).toMatchObject({ basis: 'logged', rir: 0 });
    expect(previews[0][0].xp).toBeGreaterThan(0);
  });

  it('marks a weighted bodyweight set unknown without a bodyweight', () => {
    const previews = previewSession(
      [exercise('dip', [draftSet(10, 8, failure)], 'bodyweight_plus')],
      builtIn,
      strengthOf([]),
    );
    expect(previews[0][0]).toEqual({ xp: 0, basis: 'unknown', rir: null });
  });

  it('marks a set with a weight that is not a number unknown', () => {
    const previews = previewSession([exercise('bench', [draftSet(Number.NaN, 5, failure)])], builtIn, strengthOf([]));
    expect(previews[0][0]).toEqual({ xp: 0, basis: 'unknown', rir: null });
  });

  it('awards the same XP as the server pipeline for the done sets', () => {
    const draft = [
      exercise('bench', [draftSet(100, 6, failure), draftSet(100, 5, failure), draftSet(95, 5, null)]),
      exercise('dip', [draftSet(10, 6, { type: 'rir', value: 2 })], 'bodyweight_plus'),
      exercise('pull-up', [draftSet(0, 9, null), draftSet(0, 7, failure)], 'bodyweight'),
    ];
    const strength = strengthOf([
      ['bench', 120],
      ['dip', 110],
      ['pull-up', 12],
    ]);
    const catalog: Catalog = {
      skills: [{ id: 'chest', key: 'chest', sortOrder: 1, combatWeight: 2 }],
      exercises: new Map(
        draft.map((entry) => [
          entry.exerciseId,
          {
            id: entry.exerciseId,
            loadType: entry.loadType,
            builtIn: true,
            shares: [{ skillId: 'chest', shareBasisPoints: 10_000 }],
          },
        ]),
      ),
    };
    let position = 0;
    const serverSets = draft.flatMap((entry) =>
      entry.sets.map((set) => ({
        id: set.id,
        exerciseId: entry.exerciseId,
        position: position++,
        weightKg: set.weightKg,
        reps: set.reps,
        isWarmup: false,
        effort: set.effort,
        recordedEffectiveLoadKg: effectiveLoadForNewSet(set, catalog.exercises.get(entry.exerciseId)!, 80),
      })),
    );
    const server = processSession(
      { skillXp: {}, bodyweightKg: 80 },
      { id: 'server', startedAt: '2026-10-01T10:00:00.000Z', sets: serverSets },
      DEFAULT_BALANCE,
      { catalog, strength },
    );
    const previews = previewSession(draft, builtIn, strength, 80);
    expect(previews.flat().map((preview) => preview.xp)).toEqual(server.outputs.sets.map((result) => result.xp));
  });
});
