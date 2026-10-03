import {
  DEFAULT_ROUNDING,
  type LiftDecl,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type SlotDecl,
  type WeightUnit,
} from '@domain/index.ts';

const LIFTOSAUR_SS = 'liftosaur.com/programs/ss1';

export const STARTING_STRENGTH_LIFTS = ['squat', 'bench', 'press', 'deadlift'] as const;
export type StartingStrengthLift = (typeof STARTING_STRENGTH_LIFTS)[number];

const LIFT_DECLS: LiftDecl[] = [
  { key: 'squat', name: 'Squat', category: 'lower' },
  { key: 'bench', name: 'Bench press', category: 'upper' },
  { key: 'press', name: 'Press', category: 'upper' },
  { key: 'deadlift', name: 'Deadlift', category: 'lower' },
];

function fives(day: string, lift: StartingStrengthLift, count: number): SlotDecl {
  return {
    id: `${day}-${lift}`,
    lift,
    role: 'main',
    scheme: { kind: 'repeat', count, reps: 5, load: { kind: 'pct', pct: 1, of: 'workingWeight' } },
  };
}

const FAILURES_BEFORE_RESET = { kind: 'failureCounter', threshold: 2, deloadPct: 0.1 } as const;

function sessionRule(lift: StartingStrengthLift, judgedSlots: string[]): ProgressionRule {
  return {
    lift,
    var: 'workingWeight',
    trigger: 'afterSession',
    judgedSlots,
    onMet: [{ kind: 'increment', by: { kg: 2.5, lb: 5 } }],
    onMiss: [FAILURES_BEFORE_RESET],
  };
}

export const STARTING_STRENGTH: ProgramDefinition = {
  key: 'starting_strength',
  version: 1,
  name: 'Starting Strength',
  source: [LIFTOSAUR_SS],
  lifts: LIFT_DECLS,
  inputs: [{ lifts: [...STARTING_STRENGTH_LIFTS], kinds: ['workingWeight'] }],
  referenceVars: ['workingWeight'],
  initial: [{ kind: 'copy', var: 'workingWeight', from: 'workingWeight' }],
  options: [],
  conversions: [
    { lb: 5, kg: 2.5, note: 'increment per session' },
    { lb: 10, kg: 5, note: 'squat increment for the first two squat sessions' },
  ],
  schedule: {
    kind: 'rotation',
    days: [
      {
        key: 'a',
        name: 'Workout A',
        slots: [fives('a', 'squat', 3), fives('a', 'bench', 3), fives('a', 'deadlift', 1)],
      },
      {
        key: 'b',
        name: 'Workout B',
        slots: [fives('b', 'squat', 3), fives('b', 'press', 3), fives('b', 'deadlift', 1)],
      },
    ],
  },
  progression: [
    {
      lift: 'squat',
      var: 'workingWeight',
      trigger: 'afterSession',
      judgedSlots: ['a-squat', 'b-squat'],
      onMet: [{ kind: 'increment', by: { kg: 2.5, lb: 5 }, opening: { times: 2, by: { kg: 5, lb: 10 } } }],
      onMiss: [FAILURES_BEFORE_RESET],
    },
    sessionRule('bench', ['a-bench']),
    sessionRule('press', ['b-press']),
    sessionRule('deadlift', ['a-deadlift', 'b-deadlift']),
  ],
};

export const STARTING_STRENGTH_DEFAULT_WEIGHTS_KG: Readonly<Record<StartingStrengthLift, number>> = {
  squat: 60,
  bench: 50,
  press: 35,
  deadlift: 80,
};

export function startingStrengthEnrollment(
  weights: Partial<Record<StartingStrengthLift, number>> = {},
  unit: WeightUnit = 'kg',
): ProgramEnrollment {
  const all = { ...STARTING_STRENGTH_DEFAULT_WEIGHTS_KG, ...weights };
  return {
    id: 'enrollment-starting-strength',
    unit,
    options: {},
    bindings: Object.fromEntries(STARTING_STRENGTH_LIFTS.map((lift) => [lift, lift])),
    inputs: Object.fromEntries(STARTING_STRENGTH_LIFTS.map((lift) => [lift, { workingWeight: all[lift] }])),
    rounding: DEFAULT_ROUNDING[unit],
  };
}
