import {
  type CardioExerciseDef,
  type CardioSetInput,
  type Catalog,
  DEFAULT_BALANCE,
  type ExerciseDef,
  type LiftExerciseDef,
  type LiftSetInput,
} from '@domain/index.ts';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const TEST_BALANCE = Object.freeze({
  ...DEFAULT_BALANCE,
  xpPerEffectiveRep: 10,
  coldStartXpPerSet: 10,
  intensityBonusStart: 0.75,
  intensityBonusFull: 0.95,
  intensityBonusMax: 1.3,
});

const skill = (key: string, sortOrder: number, combatWeight: number) => ({
  id: `skill-${key}`,
  key,
  sortOrder,
  combatWeight,
});

const exercise = (
  id: string,
  loadType: LiftExerciseDef['loadType'],
  builtIn: boolean,
  shares: [string, number][],
): LiftExerciseDef => ({
  id,
  loadType,
  builtIn,
  shares: shares.map(([skillKey, shareBasisPoints]) => ({ skillId: `skill-${skillKey}`, shareBasisPoints })),
});

const cardioExercise = (
  id: string,
  builtIn: boolean,
  cardio: Omit<CardioExerciseDef['cardio'], 'paceUnit' | 'tracksDistance'> &
    Partial<Pick<CardioExerciseDef['cardio'], 'paceUnit' | 'tracksDistance'>>,
  shares: [string, number][],
): CardioExerciseDef => ({
  id,
  modality: 'cardio',
  cardio: { paceUnit: 'per_km', tracksDistance: true, ...cardio },
  builtIn,
  shares: shares.map(([skillKey, shareBasisPoints]) => ({ skillId: `skill-${skillKey}`, shareBasisPoints })),
});

export const RUN_REFERENCE_PACE_S_PER_KM = 360;

export const catalog: Catalog = {
  skills: [
    skill('chest', 1, 2),
    skill('back', 2, 2),
    skill('shoulders', 3, 2),
    skill('arms', 4, 1),
    skill('legs', 5, 2),
    skill('core', 6, 1),
    skill('grip', 7, 1),
    skill('endurance', 8, 0),
    skill('agility', 9, 0),
    skill('mobility', 10, 0),
  ],
  exercises: new Map<string, ExerciseDef>([
    [
      'bench',
      exercise('bench', 'external', true, [
        ['chest', 7000],
        ['shoulders', 2000],
        ['arms', 1000],
      ]),
    ],
    [
      'squat',
      exercise('squat', 'external', true, [
        ['legs', 9000],
        ['core', 1000],
      ]),
    ],
    ['custom-press', exercise('custom-press', 'external', false, [['chest', 10000]])],
    [
      'pull-up',
      exercise('pull-up', 'bodyweight', true, [
        ['back', 7500],
        ['arms', 2500],
      ]),
    ],
    [
      'weighted-pull-up',
      exercise('weighted-pull-up', 'bodyweight_plus', true, [
        ['back', 7500],
        ['arms', 2500],
      ]),
    ],
    [
      'run',
      cardioExercise(
        'run',
        true,
        { referencePaceSPerKm: RUN_REFERENCE_PACE_S_PER_KM, maxEffort: 'max', recordMinDistanceM: 1000 },
        [['endurance', 10000]],
      ),
    ],
    [
      'sprints',
      cardioExercise('sprints', true, { referencePaceSPerKm: null, maxEffort: 'max', recordMinDistanceM: null }, [
        ['agility', 10000],
      ]),
    ],
    [
      'walk',
      cardioExercise('walk', true, { referencePaceSPerKm: null, maxEffort: 'moderate', recordMinDistanceM: null }, [
        ['endurance', 10000],
      ]),
    ],
    [
      'row-intervals',
      cardioExercise('row-intervals', true, { referencePaceSPerKm: 240, maxEffort: 'max', recordMinDistanceM: 1000 }, [
        ['endurance', 5000],
        ['agility', 5000],
      ]),
    ],
    [
      'swim',
      cardioExercise(
        'swim',
        true,
        { referencePaceSPerKm: 1200, maxEffort: 'max', recordMinDistanceM: 100, paceUnit: 'per_100m' },
        [['endurance', 10000]],
      ),
    ],
    [
      'stretch',
      cardioExercise(
        'stretch',
        true,
        { referencePaceSPerKm: null, maxEffort: 'moderate', recordMinDistanceM: null, tracksDistance: false },
        [['mobility', 10000]],
      ),
    ],
    [
      'yoga',
      cardioExercise(
        'yoga',
        true,
        { referencePaceSPerKm: null, maxEffort: 'hard', recordMinDistanceM: null, tracksDistance: false },
        [['mobility', 10000]],
      ),
    ],
    [
      'custom-run',
      cardioExercise(
        'custom-run',
        false,
        { referencePaceSPerKm: RUN_REFERENCE_PACE_S_PER_KM, maxEffort: 'max', recordMinDistanceM: null },
        [['endurance', 10000]],
      ),
    ],
  ]),
};

let setCounter = 0;

export function aSet(
  exerciseId: string,
  weightKg: number,
  reps: number,
  effort: LiftSetInput['effort'],
  overrides: Partial<LiftSetInput> = {},
): LiftSetInput {
  setCounter += 1;
  return {
    id: `set-${setCounter}`,
    exerciseId,
    position: setCounter,
    weightKg,
    reps,
    isWarmup: false,
    effort,
    ...overrides,
  };
}

export function aBout(
  exerciseId: string,
  durationS: number,
  effort: CardioSetInput['effort'],
  overrides: Partial<CardioSetInput> = {},
): CardioSetInput {
  setCounter += 1;
  return {
    kind: 'cardio',
    id: `set-${setCounter}`,
    exerciseId,
    position: setCounter,
    durationS,
    distanceM: null,
    interval: null,
    effort,
    ...overrides,
  };
}

export const hard = { type: 'level', level: 'hard' } as const;
export const nearFailure = { type: 'level', level: 'near_failure' } as const;
export const failure = { type: 'level', level: 'failure' } as const;

export const freshUser = { skillXp: {}, bodyweightKg: null };
