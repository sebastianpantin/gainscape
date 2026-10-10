import fc from 'fast-check';
import {
  type ChallengeDefinition,
  DEFAULT_BALANCE,
  type EffortInput,
  type EffortLevel,
  resolveEffort,
  type StrengthState,
} from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import { type WorkoutHelpInputs, workoutHelpKeys } from '../../web/src/features/workout/workout-help.ts';
import type { EffortInputMode } from '../../web/src/lib/profile-rules.ts';
import type {
  CardioDraftExercise,
  DraftExercise,
  DraftSet,
  LiftDraftExercise,
} from '../../web/src/offline/draft-format.ts';

const BENCH = 'barbell_bench_press';
const SQUAT = 'back_squat';
const ROW = 'rowing_machine';
const MODES: readonly EffortInputMode[] = ['level', 'rir', 'rpe'];
const LEVELS: readonly EffortLevel[] = ['easy', 'hard', 'near_failure', 'failure'];

function liftSet(id: string, overrides: Partial<DraftSet> = {}): DraftSet {
  return { id, weightKg: 60, reps: 5, effort: null, done: false, isWarmup: false, ...overrides };
}

function lift(exerciseId: string, sets: DraftSet[] = [liftSet(`${exerciseId}-1`)]): LiftDraftExercise {
  return {
    clientId: `card-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    modality: 'lift',
    loadType: 'external',
    target: null,
    sets,
  };
}

function cardio(exerciseId: string): CardioDraftExercise {
  return {
    clientId: `card-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    modality: 'cardio',
    activity: { paceUnit: 'per_km', referencePaceSPerKm: null, maxEffort: 'max', shares: [] },
    sets: [
      {
        id: `${exerciseId}-1`,
        kind: 'cardio',
        done: false,
        durationS: 600,
        distanceM: null,
        interval: null,
        effort: null,
      },
    ],
  };
}

function amrapSet(id: string): DraftSet {
  return liftSet(id, { prescription: { ref: 'squat.tm', weightKg: 80, reps: 5, minReps: 5, amrap: true } });
}

function priorSessionOf(...exerciseIds: string[]): StrengthState {
  return Object.fromEntries(
    exerciseIds.map((exerciseId) => [exerciseId, { windowMax: 100, fallbackMax: null, hasPriorSession: true }]),
  );
}

function keysOf(overrides: Partial<WorkoutHelpInputs>) {
  return workoutHelpKeys({ mode: 'level', exercises: [], strength: null, challenge: null, ...overrides });
}

const PCT_PRESCRIPTION: ChallengeDefinition = {
  kind: 'prescription',
  groups: [{ rounds: 5, exercises: [{ exerciseId: SQUAT, reps: 5, pct: 70 }] }],
};
const MIN_PCT_VOLUME: ChallengeDefinition = {
  kind: 'volume',
  metric: 'reps',
  target: 100,
  exerciseId: SQUAT,
  minPct: 50,
};
const ANY_LOAD_VOLUME: ChallengeDefinition = { ...MIN_PCT_VOLUME, minPct: null };

describe('workoutHelpKeys', () => {
  it('explains nothing on a fresh Simple-mode workout without a challenge', () => {
    expect(keysOf({ exercises: [lift(BENCH)] })).toEqual([]);
  });

  it('explains the estimated RIR note and record chips once a lift has history, even in Simple mode', () => {
    expect(keysOf({ exercises: [lift(BENCH)], strength: priorSessionOf(BENCH) })).toEqual(['rir', 'repMax']);
  });

  it('ignores history on a cardio exercise', () => {
    expect(keysOf({ exercises: [cardio(ROW)], strength: priorSessionOf(ROW) })).toEqual([]);
  });

  it('explains nothing in RIR mode before any exercise is added', () => {
    expect(keysOf({ mode: 'rir' })).toEqual([]);
  });

  it('explains nothing in RPE mode with only a cardio exercise', () => {
    expect(keysOf({ mode: 'rpe', exercises: [cardio(ROW)] })).toEqual([]);
  });

  it('explains RIR and e1RM in RIR mode with a fresh lift', () => {
    expect(keysOf({ mode: 'rir', exercises: [lift(BENCH)] })).toEqual(['rir', 'e1rm']);
  });

  it('explains RPE in RPE mode with a fresh lift', () => {
    expect(keysOf({ mode: 'rpe', exercises: [lift(BENCH)] })).toEqual(['rpe']);
  });

  it('explains RIR, RPE and rep max in RPE mode with a lift that has history', () => {
    expect(keysOf({ mode: 'rpe', exercises: [lift(BENCH)], strength: priorSessionOf(BENCH) })).toEqual([
      'rir',
      'rpe',
      'repMax',
    ]);
  });

  it.each<[string, ChallengeDefinition, string[]]>([
    ['a load percentage prescription', PCT_PRESCRIPTION, ['e1rm']],
    ['a minimum load volume', MIN_PCT_VOLUME, ['e1rm']],
    ['an any-load volume', ANY_LOAD_VOLUME, []],
  ])('explains e1RM for %s challenge only when its text mentions it', (_name, challenge, keys) => {
    expect(keysOf({ exercises: [lift(SQUAT)], challenge })).toEqual(keys);
  });

  it('explains AMRAP when a lift set is prescribed as AMRAP', () => {
    expect(keysOf({ exercises: [lift(SQUAT, [liftSet('squat-1'), amrapSet('squat-2')])] })).toEqual(['amrap']);
  });

  it('lists every key in a fixed order', () => {
    const exercises = [lift(BENCH), lift(SQUAT, [amrapSet('squat-1')])];
    expect(keysOf({ mode: 'rpe', exercises, strength: priorSessionOf(BENCH), challenge: PCT_PRESCRIPTION })).toEqual([
      'rir',
      'rpe',
      'e1rm',
      'repMax',
      'amrap',
    ]);
  });
});

const liftEffort: fc.Arbitrary<EffortInput> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(...LEVELS).map((level) => ({ type: 'level', level }) as const),
  fc.integer({ min: 0, max: 12 }).map((halfSteps) => ({ type: 'rir', value: halfSteps / 2 }) as const),
  fc.integer({ min: 10, max: 20 }).map((halfSteps) => ({ type: 'rpe', value: halfSteps / 2 }) as const),
);

const setValues = fc.record({
  effort: liftEffort,
  done: fc.boolean(),
  weightKg: fc.integer({ min: 0, max: 300 }),
  reps: fc.integer({ min: 0, max: 30 }),
});

const draftSet = (id: string) =>
  fc
    .record({ values: setValues, isWarmup: fc.boolean(), amrap: fc.boolean() })
    .map(({ values, isWarmup, amrap }) =>
      amrap ? { ...amrapSet(id), ...values, isWarmup } : liftSet(id, { ...values, isWarmup }),
    );

const exerciseArbitrary = (index: number): fc.Arbitrary<DraftExercise> =>
  fc.oneof(
    fc.constant(cardio(`cardio-${index}`)),
    fc
      .array(fc.nat(), { maxLength: 4 })
      .chain((setIds) => fc.tuple(...setIds.map((_, setIndex) => draftSet(`lift-${index}-${setIndex}`))))
      .map((sets) => lift(`lift-${index}`, sets)),
  );

const workout = fc
  .array(fc.nat(), { maxLength: 4 })
  .chain((ids) => fc.tuple(...ids.map((_, index) => exerciseArbitrary(index))))
  .chain((exercises) =>
    fc.record({
      mode: fc.constantFrom(...MODES),
      exercises: fc.constant(exercises),
      strength: fc.option(
        fc.subarray(exercises.map((exercise) => exercise.exerciseId)).map((ids) => priorSessionOf(...ids)),
        { nil: null },
      ),
      challenge: fc.constantFrom<ChallengeDefinition | null>(null, PCT_PRESCRIPTION, MIN_PCT_VOLUME, ANY_LOAD_VOLUME),
    }),
  );

function withEditedSet(
  exercises: readonly DraftExercise[],
  pick: number,
  edit: Partial<DraftSet>,
): readonly DraftExercise[] {
  const liftSets = exercises.flatMap((exercise, exerciseIndex) =>
    exercise.modality === 'lift' ? exercise.sets.map((_, setIndex) => [exerciseIndex, setIndex] as const) : [],
  );
  if (liftSets.length === 0) return exercises;
  const [exerciseAt, setAt] = liftSets[pick % liftSets.length];
  return exercises.map((exercise, exerciseIndex) =>
    exerciseIndex !== exerciseAt || exercise.modality !== 'lift'
      ? exercise
      : { ...exercise, sets: exercise.sets.map((set, setIndex) => (setIndex === setAt ? { ...set, ...edit } : set)) },
  );
}

describe('workoutHelpKeys stays still while sets are logged', () => {
  it('never changes when a lift set changes its effort, done, weight or reps', () => {
    fc.assert(
      fc.property(workout, fc.nat(), setValues, (inputs, pick, edit) => {
        const edited = { ...inputs, exercises: withEditedSet(inputs.exercises, pick, edit) };
        expect(workoutHelpKeys(edited)).toEqual(workoutHelpKeys(inputs));
      }),
    );
  });
});

describe('the e1RM help rule follows the balance', () => {
  const firstRirWithoutXp = DEFAULT_BALANCE.effectiveRirWindow + 1;
  const loggedRirOf = (input: EffortInput) => resolveEffort(input, DEFAULT_BALANCE, 'lift').loggedRir ?? -1;

  it.each(LEVELS)('keeps Simple %s below the RIR that counts only for e1RM', (level) => {
    expect(loggedRirOf({ type: 'level', level })).toBeLessThan(firstRirWithoutXp);
  });

  it('keeps the lowest RPE choice below the RIR that counts only for e1RM', () => {
    expect(loggedRirOf({ type: 'rpe', value: 6 })).toBeLessThan(firstRirWithoutXp);
  });

  it('lets the highest RIR choice reach the RIR that counts only for e1RM', () => {
    expect(loggedRirOf({ type: 'rir', value: 6 })).toBeGreaterThanOrEqual(firstRirWithoutXp);
  });
});
