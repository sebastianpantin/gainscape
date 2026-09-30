import { type Catalog, DEFAULT_BALANCE, type ExerciseDef, type SetInput } from '@domain/index.ts';

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
  loadType: ExerciseDef['loadType'],
  builtIn: boolean,
  shares: [string, number][],
): ExerciseDef => ({
  id,
  loadType,
  builtIn,
  shares: shares.map(([skillKey, shareBasisPoints]) => ({ skillId: `skill-${skillKey}`, shareBasisPoints })),
});

export const catalog: Catalog = {
  skills: [
    skill('chest', 1, 2),
    skill('back', 2, 2),
    skill('shoulders', 3, 2),
    skill('arms', 4, 1),
    skill('legs', 5, 2),
    skill('core', 6, 1),
  ],
  exercises: new Map([
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
  ]),
};

let setCounter = 0;

export function aSet(
  exerciseId: string,
  weightKg: number,
  reps: number,
  effort: SetInput['effort'],
  overrides: Partial<SetInput> = {},
): SetInput {
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

export const hard = { type: 'level', level: 'hard' } as const;
export const nearFailure = { type: 'level', level: 'near_failure' } as const;
export const failure = { type: 'level', level: 'failure' } as const;

export const freshUser = { skillXp: {}, bodyweightKg: null };
