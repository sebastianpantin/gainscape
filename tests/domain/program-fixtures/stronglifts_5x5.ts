import {
  DEFAULT_ROUNDING,
  type LiftDecl,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type SlotDecl,
  type UnitAmount,
  type WeightUnit,
} from '@domain/index.ts';

const STRONGLIFTS_PROGRAM = 'https://stronglifts.com/stronglifts-5x5/workout-program/';
const STRONGLIFTS_PROGRESS = 'https://stronglifts.com/stronglifts-5x5/progress/';
const STRONGLIFTS_FAILURE = 'https://stronglifts.com/stronglifts-5x5/failure/';
const STRONGLIFTS_INCREMENTS = 'https://support.stronglifts.com/article/71-increments';
const TEMPLATE_NAME_IN_CATALOG = 'stronglifts_5x5';

export const STRONGLIFTS_LIFTS = ['squat', 'bench', 'row', 'press', 'deadlift'] as const;
export type StrongLiftsLift = (typeof STRONGLIFTS_LIFTS)[number];

const LIFT_DECLS: LiftDecl[] = [
  { key: 'squat', name: 'Squat', category: 'lower' },
  { key: 'bench', name: 'Bench press', category: 'upper' },
  { key: 'row', name: 'Barbell row', category: 'upper' },
  { key: 'press', name: 'Overhead press', category: 'upper' },
  { key: 'deadlift', name: 'Deadlift', category: 'lower' },
];

function fives(day: string, lift: StrongLiftsLift, count: number): SlotDecl {
  return {
    id: `${day}-${lift}`,
    lift,
    role: 'main',
    scheme: { kind: 'repeat', count, reps: 5, load: { kind: 'pct', pct: 1, of: 'workingWeight' } },
  };
}

const SESSION_INCREMENT: UnitAmount = { kg: 2.5, lb: 5 };
const DEADLIFT_INCREMENT: UnitAmount = { kg: 5, lb: 10 };

function linearRule(lift: StrongLiftsLift, judgedSlots: string[], by: UnitAmount): ProgressionRule {
  return {
    lift,
    var: 'workingWeight',
    trigger: 'afterSession',
    judgedSlots,
    onMet: [{ kind: 'increment', by }],
    onMiss: [{ kind: 'failureCounter', threshold: 3, deloadPct: 0.1 }],
  };
}

export const STRONGLIFTS_5X5: ProgramDefinition = {
  key: TEMPLATE_NAME_IN_CATALOG,
  version: 1,
  name: 'StrongLifts 5x5',
  source: [STRONGLIFTS_PROGRAM, STRONGLIFTS_PROGRESS, STRONGLIFTS_FAILURE, STRONGLIFTS_INCREMENTS],
  lifts: LIFT_DECLS,
  inputs: [{ lifts: [...STRONGLIFTS_LIFTS], kinds: ['workingWeight'] }],
  referenceVars: ['workingWeight'],
  initial: [{ kind: 'copy', var: 'workingWeight', from: 'workingWeight' }],
  options: [],
  schedule: {
    kind: 'rotation',
    days: [
      { key: 'a', name: 'Day 1', slots: [fives('a', 'squat', 5), fives('a', 'bench', 5), fives('a', 'row', 5)] },
      {
        key: 'b',
        name: 'Day 2',
        slots: [fives('b', 'squat', 5), fives('b', 'press', 5), fives('b', 'deadlift', 1)],
      },
    ],
  },
  progression: [
    linearRule('squat', ['a-squat', 'b-squat'], SESSION_INCREMENT),
    linearRule('bench', ['a-bench'], SESSION_INCREMENT),
    linearRule('row', ['a-row'], SESSION_INCREMENT),
    linearRule('press', ['b-press'], SESSION_INCREMENT),
    linearRule('deadlift', ['b-deadlift'], DEADLIFT_INCREMENT),
  ],
};

export const STRONGLIFTS_DEFAULT_WEIGHTS_KG: Readonly<Record<StrongLiftsLift, number>> = {
  squat: 100,
  bench: 60,
  row: 50,
  press: 40,
  deadlift: 120,
};

export function strongLiftsEnrollment(
  weights: Partial<Record<StrongLiftsLift, number>> = {},
  unit: WeightUnit = 'kg',
): ProgramEnrollment {
  const all = { ...STRONGLIFTS_DEFAULT_WEIGHTS_KG, ...weights };
  return {
    id: 'enrollment-stronglifts',
    unit,
    options: {},
    bindings: Object.fromEntries(STRONGLIFTS_LIFTS.map((lift) => [lift, lift])),
    inputs: Object.fromEntries(STRONGLIFTS_LIFTS.map((lift) => [lift, { workingWeight: all[lift] }])),
    rounding: DEFAULT_ROUNDING[unit],
  };
}
