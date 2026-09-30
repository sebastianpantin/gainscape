import { describe, expect, it } from 'vitest';
import {
  BodyweightLoadNotZeroError,
  BodyweightRequiredError,
  carriedEffectiveLoadKg,
  type ExerciseDef,
  HISTORY_ONLY_STEPS,
  processSession,
  REP_MAX_SLOT_COUNT,
  type SessionInput,
  UnknownExerciseError,
} from '@domain/index.ts';
import { aSet, catalog, freshUser, hard, nearFailure, TEST_BALANCE } from './fixtures.ts';

const threeSets = (exerciseId: string, weightKg: number, effort: typeof hard | typeof nearFailure) =>
  [0, 1, 2].map(() => aSet(exerciseId, weightKg, 8, effort));

const fixtureSession: SessionInput = {
  id: 'session-1',
  startedAt: '2026-09-28T10:00:00Z',
  sets: [...threeSets('bench', 60, hard), ...threeSets('squat', 100, nearFailure)],
};

describe('processSession', () => {
  it('awards XP per skill, with an intensity bonus once an e1RM exists within the session', () => {
    const { nextState, outputs } = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    expect(outputs.sets.map((result) => result.xp)).toEqual([30, 30, 30, 50, 53, 53]);
    expect(outputs.xpBySkill).toEqual({ chest: 63, shoulders: 18, arms: 9, legs: 141, core: 15 });
    expect(outputs.levelUps).toEqual([{ skill: 'legs', from: 1, to: 2 }]);
    expect(nextState.skillXp['skill-legs']).toBe(141);
  });

  it('is deterministic', () => {
    const first = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    const second = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    expect(second).toEqual(first);
  });

  it('builds on existing XP', () => {
    const { outputs } = processSession(
      { skillXp: { 'skill-legs': 100 }, bodyweightKg: null },
      fixtureSession,
      TEST_BALANCE,
      { catalog },
    );
    expect(outputs.levelUps).toContainEqual({ skill: 'legs', from: 2, to: 3 });
  });

  it('treats unrated sets in the first session of an exercise as cold start', () => {
    const unrated = { ...fixtureSession, sets: [aSet('bench', 60, 8, null)] };
    const { outputs } = processSession(freshUser, unrated, TEST_BALANCE, { catalog });
    expect(outputs.sets[0]).toMatchObject({
      effortInputType: null,
      effortValue: null,
      rir: null,
      rirSource: 'cold_start',
      xp: 10,
    });
  });

  it('rejects exercises missing from the catalog', () => {
    const unknown = { ...fixtureSession, sets: [aSet('nope', 60, 8, hard)] };
    expect(() => processSession(freshUser, unknown, TEST_BALANCE, { catalog })).toThrow(UnknownExerciseError);
  });

  it('requires bodyweight for bodyweight exercises', () => {
    const pullUps = { ...fixtureSession, sets: [aSet('pull-up', 0, 8, hard)] };
    expect(() => processSession(freshUser, pullUps, TEST_BALANCE, { catalog })).toThrow(BodyweightRequiredError);
  });

  it('uses bodyweight plus added load as the effective load', () => {
    const weighted = { ...fixtureSession, sets: [aSet('weighted-pull-up', 10, 5, hard), aSet('pull-up', 0, 10, hard)] };
    const { outputs } = processSession({ skillXp: {}, bodyweightKg: 80 }, weighted, TEST_BALANCE, { catalog });
    expect(outputs.sets.map((result) => result.effectiveLoadKg)).toEqual([90, 80]);
  });

  it('prefers a recorded effective load over the current bodyweight', () => {
    const replayed = { ...fixtureSession, sets: [aSet('pull-up', 0, 10, hard, { recordedEffectiveLoadKg: 75 })] };
    const { outputs } = processSession({ skillXp: {}, bodyweightKg: 80 }, replayed, TEST_BALANCE, { catalog });
    expect(outputs.sets[0].effectiveLoadKg).toBe(75);
  });

  it('lets callers replace the step list', () => {
    const { outputs } = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog }, []);
    expect(outputs.sets).toEqual([]);
  });
});

describe('HISTORY_ONLY_STEPS', () => {
  const lightRecords = {
    repMaxes: {
      bench: Array.from({ length: REP_MAX_SLOT_COUNT }, () => ({
        loadKg: 40,
        setId: 'old',
        achievedAt: '2026-01-01T00:00:00.000Z',
        exactSetId: null,
      })),
    },
    bodyweightReps: {},
  };
  const heavy = { ...fixtureSession, sets: [aSet('bench', 100, 5, hard), aSet('bench', 100, 5, null)] };
  const strength = { bench: { windowMax: 90, fallbackMax: 90, hasPriorSession: true } };

  it('keeps the logged effort, pays no XP and reports no records', () => {
    const { outputs } = processSession(
      { skillXp: {}, bodyweightKg: null, records: lightRecords },
      heavy,
      TEST_BALANCE,
      { catalog, strength },
      HISTORY_ONLY_STEPS,
    );
    expect(outputs.sets.map((result) => [result.rir, result.rirSource])).toEqual([
      [3, 'logged'],
      [null, 'cold_start'],
    ]);
    for (const result of outputs.sets) {
      expect(result).toMatchObject({ xp: 0, effectiveReps: 0, e1rmCandidateKg: null, repsCapacityCandidate: null });
    }
    expect(outputs.xpBySkill).toEqual({});
    expect(outputs.levelUps).toEqual([]);
    expect(outputs.prs).toEqual([]);
  });
});

describe('carriedEffectiveLoadKg', () => {
  const external: ExerciseDef = catalog.exercises.get('bench')!;
  const pullUp: ExerciseDef = catalog.exercises.get('pull-up')!;
  const weightedDip: ExerciseDef = { id: 'weighted-dip', loadType: 'bodyweight_plus', builtIn: true, shares: [] };

  it('uses the new weight for an external exercise', () => {
    const stored = { exerciseId: 'bench', weightKg: 60, effectiveLoadKg: 60 };
    expect(carriedEffectiveLoadKg(stored, { exerciseId: 'bench', weightKg: 62.5 }, external, 80)).toBe(62.5);
  });

  it('keeps the logged bodyweight when only the added load changes', () => {
    const stored = { exerciseId: 'weighted-dip', weightKg: 10, effectiveLoadKg: 90 };
    expect(carriedEffectiveLoadKg(stored, { exerciseId: 'weighted-dip', weightKg: 20 }, weightedDip, 85)).toBe(100);
  });

  it('rounds the carried load to 2 decimals', () => {
    const stored = { exerciseId: 'weighted-dip', weightKg: 0.2, effectiveLoadKg: 80.3 };
    expect(carriedEffectiveLoadKg(stored, { exerciseId: 'weighted-dip', weightKg: 0.1 }, weightedDip, 85)).toBe(80.2);
  });

  it('uses the current bodyweight when the exercise changes', () => {
    const stored = { exerciseId: 'weighted-dip', weightKg: 10, effectiveLoadKg: 90 };
    expect(carriedEffectiveLoadKg(stored, { exerciseId: 'pull-up', weightKg: 0 }, pullUp, 85)).toBe(85);
  });

  it('requires a bodyweight when the exercise changes to a bodyweight one', () => {
    const stored = { exerciseId: 'bench', weightKg: 60, effectiveLoadKg: 60 };
    expect(() => carriedEffectiveLoadKg(stored, { exerciseId: 'pull-up', weightKg: 0 }, pullUp, null)).toThrow(
      BodyweightRequiredError,
    );
  });

  it('rejects added load on a pure bodyweight exercise', () => {
    const stored = { exerciseId: 'pull-up', weightKg: 0, effectiveLoadKg: 80 };
    expect(() => carriedEffectiveLoadKg(stored, { exerciseId: 'pull-up', weightKg: 5 }, pullUp, 80)).toThrow(
      BodyweightLoadNotZeroError,
    );
  });
});
