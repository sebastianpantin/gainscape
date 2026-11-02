import { describe, expect, it } from 'vitest';
import {
  type Catalog,
  DEFAULT_BALANCE,
  type ExerciseStrength,
  processSession,
  type SetInput,
  type SetResult,
} from '@domain/index.ts';
import { type PreviewRecord, recordStateFrom } from '../../web/src/features/workout/record-preview.ts';
import { previewDraft, type PreviewContext } from '../../web/src/features/workout/xp-preview.ts';
import type { CardioActivity, LoadType } from '../../web/src/lib/exercises/catalog-rules.ts';
import { type RecordBaseline } from '../../web/src/lib/workout/session-baseline-rules.ts';
import type {
  CardioDraftExercise,
  DraftExercise,
  DraftSet,
  HoldDraftExercise,
  HoldDraftSet,
  LiftDraftExercise,
} from '../../web/src/offline/draft-format.ts';

const BODYWEIGHT_KG = 80;
const hard = { type: 'level', level: 'hard' } as const;

let setCounter = 0;

function liftSet(weightKg: number, reps: number, overrides: Partial<DraftSet> = {}): DraftSet {
  setCounter += 1;
  return { id: `set-${setCounter}`, weightKg, reps, effort: hard, done: true, isWarmup: false, ...overrides };
}

function holdSet(weightKg: number, durationS: number, done = true): HoldDraftSet {
  setCounter += 1;
  return { id: `hold-${setCounter}`, kind: 'hold', weightKg, durationS, distanceM: null, effort: null, done };
}

function lift(exerciseId: string, loadType: LoadType, sets: DraftSet[]): LiftDraftExercise {
  return {
    clientId: `card-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    modality: 'lift',
    loadType,
    target: null,
    sets,
  };
}

function hold(exerciseId: string, sets: HoldDraftSet[]): HoldDraftExercise {
  return {
    clientId: `card-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    modality: 'hold',
    measure: 'time',
    loadType: 'external',
    sets,
  };
}

const running: CardioActivity = {
  paceUnit: 'per_km',
  referencePaceSPerKm: 360,
  maxEffort: 'max',
  tracksDistance: true,
  shares: [{ skillKey: 'endurance', shareBasisPoints: 10_000 }],
};

function run(distanceM: number): CardioDraftExercise {
  setCounter += 1;
  return {
    clientId: 'card-run',
    exerciseId: 'run',
    name: 'run',
    modality: 'cardio',
    activity: running,
    sets: [
      {
        id: `bout-${setCounter}`,
        kind: 'cardio',
        durationS: 1800,
        distanceM,
        interval: null,
        effort: { type: 'cardio', level: 'moderate' },
        done: true,
      },
    ],
  };
}

const trained: Record<string, ExerciseStrength> = Object.fromEntries(
  ['bench', 'pull-up'].map((id) => [id, { windowMax: 100, fallbackMax: null, hasPriorSession: true }]),
);

const baseline: RecordBaseline = {
  repMaxKg: { bench: [110, 105, 100, 97.5, 95, null, null, null, null, null] },
  maxReps: { 'pull-up': 10 },
  cardioBest: { pinch: { duration: 30 }, run: { distance: 4000 } },
};

function context(overrides: Partial<PreviewContext> = {}): PreviewContext {
  return {
    isBuiltIn: () => true,
    strength: trained,
    bodyweightKg: BODYWEIGHT_KG,
    recordBaseline: baseline,
    ...overrides,
  };
}

function serverRecords(exercises: readonly (LiftDraftExercise | HoldDraftExercise)[], draft: DraftExercise[]) {
  const catalog: Catalog = {
    skills: [{ id: 'all', key: 'all', sortOrder: 0, combatWeight: 0 }],
    exercises: new Map(
      exercises.map((exercise) => [
        exercise.exerciseId,
        {
          id: exercise.exerciseId,
          loadType: exercise.loadType,
          ...(exercise.modality === 'hold' ? { measure: exercise.measure } : {}),
          builtIn: true,
          shares: [{ skillId: 'all', shareBasisPoints: 10_000 }],
        },
      ]),
    ),
  };
  let position = 0;
  const sets = draft.flatMap((exercise): SetInput[] => {
    if (exercise.modality === 'cardio') return [];
    const load = (weightKg: number) => (exercise.loadType === 'external' ? weightKg : BODYWEIGHT_KG + weightKg);
    if (exercise.modality === 'hold') {
      return exercise.sets.map((set) => ({
        kind: 'hold' as const,
        id: set.id,
        exerciseId: exercise.exerciseId,
        position: position++,
        weightKg: set.weightKg,
        durationS: set.durationS,
        distanceM: null,
        effort: set.effort,
        recordedEffectiveLoadKg: load(set.weightKg),
      }));
    }
    return exercise.sets.map((set) => ({
      id: set.id,
      exerciseId: exercise.exerciseId,
      position: position++,
      weightKg: set.weightKg,
      reps: set.reps,
      isWarmup: set.isWarmup,
      effort: set.effort,
      recordedEffectiveLoadKg: load(set.weightKg),
    }));
  });
  const { outputs } = processSession(
    { skillXp: {}, bodyweightKg: BODYWEIGHT_KG, records: recordStateFrom(baseline) },
    { id: 'server', startedAt: '2026-10-01T10:00:00.000Z', sets },
    DEFAULT_BALANCE,
    { catalog, strength: trained },
  );
  return new Map(outputs.sets.map((result) => [result.set.id, recordOf(result)]));
}

function recordOf(result: SetResult): PreviewRecord | null {
  const [gain] = result.holdRecords ?? [];
  if (gain !== undefined) return { kind: 'hold', gain };
  return result.personalRecord;
}

describe('previewDraft', () => {
  const bench = lift('bench', 'external', [
    liftSet(60, 10, { isWarmup: true }),
    liftSet(100, 5),
    liftSet(102.5, 5),
    liftSet(90, 3),
  ]);
  const pullUps = lift('pull-up', 'bodyweight', [liftSet(0, 11), liftSet(0, 9)]);
  const pinch = hold('pinch', [holdSet(24, 45), holdSet(24, 40)]);
  const draft: DraftExercise[] = [bench, pullUps, pinch];

  it('predicts the records the server awards for the same sets', () => {
    const server = serverRecords([bench, pullUps, pinch], draft);
    const { records } = previewDraft(draft, context());
    const expected = draft.map((exercise) => exercise.sets.map((set) => server.get(set.id) ?? null));
    expect(records).toEqual(expected);
    expect(records.flat().filter((record) => record !== null)).toHaveLength(4);
  });

  it('predicts XP and records together, one grid each per exercise and set', () => {
    const { previews, records } = previewDraft(draft, context());
    expect(previews.map((sets) => sets.length)).toEqual([4, 2, 2]);
    expect(records.map((sets) => sets.length)).toEqual([4, 2, 2]);
  });

  it('predicts no record before the record baseline has loaded', () => {
    const { records } = previewDraft(draft, context({ recordBaseline: null }));
    expect(records.flat().every((record) => record === null)).toBe(true);
  });

  it('predicts no record for a set not logged yet', () => {
    const planned = [lift('bench', 'external', [liftSet(120, 5, { done: false })])];
    expect(previewDraft(planned, context()).records).toEqual([[null]]);
  });

  it('predicts no record for a set the server would refuse', () => {
    const tooLongHold = hold('pinch', [holdSet(24, 3601)]);
    const badEffort = lift('bench', 'external', [liftSet(120, 5, { effort: { type: 'rir', value: -1 } })]);
    expect(previewDraft([tooLongHold], context()).records).toEqual([[null]]);
    expect(previewDraft([badEffort], context()).records).toEqual([[null]]);
  });

  it('leaves cardio bests out of the preview', () => {
    expect(previewDraft([run(6000)], context()).records).toEqual([[null]]);
  });
});
