import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BodyweightLoadNotZeroError,
  BodyweightRequiredError,
  cardioExercise,
  carriedEffectiveLoadKg,
  type CardioSetInput,
  type EffortInput,
  type ExerciseDef,
  HISTORY_ONLY_STEPS,
  KindMismatchError,
  liftExerciseFor,
  type LiftSetInput,
  processSession,
  REP_MAX_SLOT_COUNT,
  type SessionInput,
  strengthHistoryRows,
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
    expect(outputs.sets.map((result) => result.xp)).toEqual([30, 30, 30, 50, 55, 55]);
    expect(outputs.xpBySkill).toEqual({ chest: 63, shoulders: 18, arms: 9, legs: 144, core: 16 });
    expect(outputs.levelUps).toEqual([{ skill: 'legs', from: 1, to: 2 }]);
    expect(nextState.skillXp['skill-legs']).toBe(144);
  });

  it('reports only the XP that fits under the XP cap', () => {
    const nearCap = { skillXp: { 'skill-chest': TEST_BALANCE.maxXp - 5 }, bodyweightKg: null };
    const session: SessionInput = {
      id: 'capped',
      startedAt: '2026-09-28T10:00:00Z',
      sets: [aSet('bench', 60, 8, hard)],
    };
    const { outputs } = processSession(nearCap, session, TEST_BALANCE, { catalog });
    expect(outputs.xpBySkill.chest).toBe(5);
  });

  it('rotates tied remainders across sets of the same exercise', () => {
    const cfg = { ...TEST_BALANCE, xpPerEffectiveRep: 75 };
    const fiveEffectiveReps = { type: 'rir', value: 1 } as const;
    const session: SessionInput = {
      id: 'rotation',
      startedAt: '2026-09-28T10:00:00Z',
      sets: [
        aSet('bench', 20, 11, fiveEffectiveReps),
        aSet('squat', 100, 5, hard),
        aSet('bench', 20, 11, fiveEffectiveReps),
      ],
    };
    const { outputs } = processSession(freshUser, session, cfg, { catalog });
    expect(outputs.sets[0].skillXp).toEqual([
      { skillId: 'skill-chest', xp: 263 },
      { skillId: 'skill-shoulders', xp: 75 },
      { skillId: 'skill-arms', xp: 37 },
    ]);
    expect(outputs.sets[2].skillXp).toEqual([
      { skillId: 'skill-chest', xp: 262 },
      { skillId: 'skill-shoulders', xp: 75 },
      { skillId: 'skill-arms', xp: 38 },
    ]);
  });

  it('rotates tied remainders only across sets that earn XP', () => {
    const cfg = { ...TEST_BALANCE, xpPerEffectiveRep: 75 };
    const fiveEffectiveReps = { type: 'rir', value: 1 } as const;
    const session: SessionInput = {
      id: 'rotation-warmup',
      startedAt: '2026-09-28T10:00:00Z',
      sets: [aSet('bench', 10, 11, hard, { isWarmup: true }), aSet('bench', 20, 11, fiveEffectiveReps)],
    };
    const { outputs } = processSession(freshUser, session, cfg, { catalog });
    expect(outputs.sets[1].skillXp).toContainEqual({ skillId: 'skill-chest', xp: 263 });
  });

  it('pins the derived columns of every set', () => {
    const { outputs } = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    const bench = (e1rmBeforeKg: number | null) => ({
      rir: 3,
      rirSource: 'logged',
      effectiveReps: 3,
      intensityBonus: 1,
      e1rmBeforeKg,
      e1rmCandidateKg: 80,
      skillXp: [
        { skillId: 'skill-chest', xp: 21 },
        { skillId: 'skill-shoulders', xp: 6 },
        { skillId: 'skill-arms', xp: 3 },
      ],
    });
    const squat = (e1rmBeforeKg: number | null, intensityBonus: number, legsXp: number, coreXp: number) => ({
      rir: 1,
      rirSource: 'logged',
      effectiveReps: 5,
      intensityBonus,
      e1rmBeforeKg,
      e1rmCandidateKg: 126.67,
      skillXp: [
        { skillId: 'skill-legs', xp: legsXp },
        { skillId: 'skill-core', xp: coreXp },
      ],
    });
    expect(outputs.sets).toMatchObject([
      bench(null),
      bench(80),
      bench(80),
      squat(null, 1, 45, 5),
      squat(126.67, 1.091216, 49, 6),
      squat(126.67, 1.091216, 50, 5),
    ]);
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

  it('rejects added load on a pure bodyweight exercise even with a recorded load', () => {
    const replayed = { ...fixtureSession, sets: [aSet('pull-up', 5, 10, hard, { recordedEffectiveLoadKg: 85 })] };
    expect(() => processSession({ skillXp: {}, bodyweightKg: 80 }, replayed, TEST_BALANCE, { catalog })).toThrow(
      BodyweightLoadNotZeroError,
    );
  });

  it('lets callers replace the step list', () => {
    const { outputs } = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog }, []);
    expect(outputs.sets).toEqual([]);
  });
});

describe('lift results beside cardio bouts', () => {
  const liftEffort = fc.constantFrom<EffortInput>(
    null,
    { type: 'level', level: 'hard' },
    { type: 'level', level: 'failure' },
    { type: 'rir', value: 2 },
    { type: 'rpe', value: 9 },
  );
  const cardioEffort = fc.constantFrom<EffortInput>(
    null,
    { type: 'cardio', level: 'easy' },
    { type: 'cardio', level: 'max' },
  );
  const lift = fc.record({
    exerciseId: fc.constantFrom('bench', 'squat', 'pull-up', 'weighted-pull-up', 'custom-press'),
    weightKg: fc.integer({ min: 0, max: 160 }),
    reps: fc.integer({ min: 1, max: 20 }),
    isWarmup: fc.boolean(),
    effort: liftEffort,
  });
  const bout = fc.record({
    exerciseId: fc.constantFrom('run', 'sprints', 'walk', 'row-intervals', 'custom-run'),
    durationS: fc.integer({ min: 60, max: 14_400 }),
    distanceM: fc.option(fc.integer({ min: 1, max: 60_000 }), { nil: null }),
    interval: fc.option(
      fc.record({
        workS: fc.integer({ min: 5, max: 120 }),
        restS: fc.integer({ min: 0, max: 120 }),
        rounds: fc.integer({ min: 1, max: 30 }),
      }),
      { nil: null },
    ),
    effort: cardioEffort,
    slot: fc.nat(),
  });
  const strength = {
    bench: { windowMax: 90, fallbackMax: 90, hasPriorSession: true },
    'pull-up': { windowMax: 12, fallbackMax: 12, hasPriorSession: true },
  };

  it('are identical with or without interleaved cardio bouts', () => {
    fc.assert(
      fc.property(fc.array(lift, { minLength: 1, maxLength: 12 }), fc.array(bout, { maxLength: 6 }), (lifts, bouts) => {
        const liftSets: LiftSetInput[] = lifts.map((entry, index) => {
          const weightKg = entry.exerciseId === 'pull-up' ? 0 : entry.weightKg;
          return { ...entry, weightKg, id: `lift-${index}`, position: index * 10 };
        });
        const cardioSets: CardioSetInput[] = bouts.map(({ slot, ...entry }, index) => ({
          ...entry,
          kind: 'cardio',
          id: `bout-${index}`,
          position: (slot % (lifts.length + 1)) * 10 - 5 + index / 10,
        }));
        const run = (sets: SessionInput['sets']) =>
          processSession(
            { skillXp: {}, bodyweightKg: 80 },
            { id: 'mixed', startedAt: '2026-09-28T10:00:00.000Z', sets },
            TEST_BALANCE,
            { catalog, strength },
          );
        const liftOnly = run(liftSets);
        const mixed = run([...liftSets, ...cardioSets]);
        const mixedLifts = mixed.outputs.sets.filter((result) => result.cardio === null);
        expect(mixedLifts).toEqual(liftOnly.outputs.sets);
        expect({ ...mixed.nextState.records, cardio: {} }).toEqual(liftOnly.nextState.records);
        expect(mixed.outputs.prs.filter((pr) => pr.kind !== 'cardio')).toEqual(liftOnly.outputs.prs);
        expect(strengthHistoryRows({ id: 'mixed', startedAt: '2026-09-28T10:00:00.000Z' }, mixed.outputs.sets)).toEqual(
          strengthHistoryRows({ id: 'mixed', startedAt: '2026-09-28T10:00:00.000Z' }, liftOnly.outputs.sets),
        );
        for (const skill of ['chest', 'back', 'shoulders', 'arms', 'legs', 'core']) {
          expect(mixed.outputs.xpBySkill[skill]).toBe(liftOnly.outputs.xpBySkill[skill]);
        }
      }),
    );
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
    cardio: {},
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

  it('rejects a cardio exercise, which carries no load', () => {
    const stored = { exerciseId: 'run', weightKg: 0, effectiveLoadKg: 0 };
    expect(() =>
      carriedEffectiveLoadKg(stored, { exerciseId: 'run', weightKg: 0 }, catalog.exercises.get('run')!, 80),
    ).toThrow(KindMismatchError);
  });

  it('rejects added load on a pure bodyweight exercise', () => {
    const stored = { exerciseId: 'pull-up', weightKg: 0, effectiveLoadKg: 80 };
    expect(() => carriedEffectiveLoadKg(stored, { exerciseId: 'pull-up', weightKg: 5 }, pullUp, 80)).toThrow(
      BodyweightLoadNotZeroError,
    );
  });
});

describe('exercise lookup', () => {
  it('finds a lift exercise for a lift set', () => {
    expect(liftExerciseFor(aSet('bench', 60, 5, hard), catalog)).toBe(catalog.exercises.get('bench'));
  });

  it('rejects a lift set on a cardio exercise and an exercise missing from the catalog', () => {
    expect(() => liftExerciseFor(aSet('run', 0, 5, hard), catalog)).toThrow(KindMismatchError);
    expect(() => liftExerciseFor(aSet('missing', 0, 5, hard), catalog)).toThrow(UnknownExerciseError);
  });

  it('finds a cardio exercise and rejects a lift one', () => {
    const run = catalog.exercises.get('run')!;
    expect(cardioExercise(run)).toBe(run);
    expect(() => cardioExercise(catalog.exercises.get('bench')!)).toThrow(KindMismatchError);
  });
});
