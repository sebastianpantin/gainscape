import type {
  CardioDraftExercise,
  DraftSet,
  LiftDraftExercise,
  WorkoutDraft,
} from '../../web/src/offline/draft-format.ts';

export const DRAFT_USER_ID = '11111111-1111-4111-8111-111111111111';

export function workout(overrides: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    sessionId: '22222222-2222-4222-8222-222222222222',
    startedAt: '2026-09-30T10:00:00.000Z',
    finishedAt: '2026-09-30T11:00:00.000Z',
    programDayId: null,
    programLabel: null,
    program: null,
    challenge: null,
    exercises: [
      {
        clientId: 'card-bench',
        exerciseId: 'bench',
        name: 'Bench',
        modality: 'lift',
        loadType: 'external',
        target: null,
        supersetId: null,
        sets: [
          {
            id: 'set-a',
            weightKg: 60,
            reps: 8,
            effort: { type: 'level', level: 'hard' },
            done: true,
            isWarmup: false,
            prescription: null,
          },
          { id: 'set-b', weightKg: 60, reps: 8, effort: null, done: false, isWarmup: false, prescription: null },
        ],
      },
      {
        clientId: 'card-row',
        exerciseId: 'row',
        name: 'Row',
        modality: 'lift',
        loadType: 'external',
        target: { sets: 3, repsMin: 8, repsMax: 12 },
        supersetId: null,
        sets: [
          { id: 'set-c', weightKg: 50, reps: 10, effort: null, done: false, isWarmup: false, prescription: null },
          {
            id: 'set-d',
            weightKg: 50,
            reps: 10,
            effort: { type: 'level', level: 'easy' },
            done: true,
            isWarmup: false,
            prescription: null,
          },
          { id: 'set-e', weightKg: 55, reps: 9, effort: null, done: true, isWarmup: false, prescription: null },
        ],
      },
    ],
    ...overrides,
  };
}

export function withoutModality(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'modality'));
}

export function withoutSupersetId(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'supersetId'));
}

export function liftsOf(draft: WorkoutDraft | null | undefined): LiftDraftExercise[] {
  return (draft?.exercises ?? []).filter((exercise): exercise is LiftDraftExercise => exercise.modality === 'lift');
}

export function cardioExercise(overrides: Partial<CardioDraftExercise> = {}): CardioDraftExercise {
  return {
    clientId: 'card-run',
    exerciseId: 'run',
    name: 'Running',
    modality: 'cardio',
    activity: {
      paceUnit: 'per_km',
      referencePaceSPerKm: 360,
      maxEffort: 'max',
      tracksDistance: true,
      shares: [{ skillKey: 'endurance', shareBasisPoints: 10_000 }],
    },
    sets: [
      {
        id: 'bout-a',
        kind: 'cardio',
        durationS: 1800,
        distanceM: 5000,
        interval: null,
        effort: { type: 'cardio', level: 'moderate' },
        done: true,
      },
      {
        id: 'bout-b',
        kind: 'cardio',
        durationS: 1800,
        distanceM: null,
        interval: { workS: 30, restS: 30, rounds: 10 },
        effort: null,
        done: true,
      },
      {
        id: 'bout-c',
        kind: 'cardio',
        durationS: 600,
        distanceM: null,
        interval: null,
        effort: null,
        done: false,
      },
    ],
    ...overrides,
  };
}

export function mixedWorkout(): WorkoutDraft {
  return workout({ exercises: [cardioExercise(), ...workout().exercises] });
}

export function set(id: string, overrides: Partial<DraftSet> = {}): DraftSet {
  return { id, weightKg: 100, reps: 5, effort: null, done: false, isWarmup: false, prescription: null, ...overrides };
}

export function lift(
  exerciseId: string,
  sets: DraftSet[],
  overrides: Partial<LiftDraftExercise> = {},
): LiftDraftExercise {
  return {
    clientId: `card-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    modality: 'lift',
    loadType: 'external',
    target: null,
    supersetId: null,
    sets,
    ...overrides,
  };
}

export function draftOf(exercises: WorkoutDraft['exercises'], overrides: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    sessionId: 'session',
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: null,
    programDayId: null,
    programLabel: null,
    exercises,
    ...overrides,
  };
}
