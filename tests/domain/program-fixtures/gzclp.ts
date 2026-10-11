import {
  DEFAULT_ROUNDING,
  type ProgramDefinition,
  type ProgramEnrollment,
  type RoundingSetting,
  type WeightUnit,
} from '@domain/index.ts';
import { type DayDecl, type ProgressionRule, type SlotDecl } from '@domain/program-definition.ts';

const GZCLP_WIKI = 'https://thefitness.wiki/routines/gzclp/';
const GZCL_ARCHIVE = 'https://thefitness.wiki/reddit-archive/gzcl-method-novice-to-elite/';

const T1_STAGES = [
  { sets: 5, reps: 3, amrapLast: true },
  { sets: 6, reps: 2, amrapLast: true },
  { sets: 10, reps: 1, amrapLast: true },
];
const T2_STAGES = [
  { sets: 3, reps: 10, amrapLast: false },
  { sets: 3, reps: 8, amrapLast: false },
  { sets: 3, reps: 6, amrapLast: false },
];

const UPPER = { kg: 2.5, lb: 5 };
const LOWER = { kg: 5, lb: 10 };

function tierOne(day: string, lift: string): SlotDecl {
  return {
    id: `${day}-${lift}`,
    lift,
    role: 'main',
    scheme: { kind: 'stages', stages: T1_STAGES, load: { kind: 'pct', pct: 1, of: 'workingWeight' } },
  };
}

function tierTwo(day: string, lift: string): SlotDecl {
  return {
    id: `${day}-${lift}`,
    lift,
    role: 'supplemental',
    scheme: { kind: 'stages', stages: T2_STAGES, load: { kind: 'pct', pct: 1, of: 'workingWeight' } },
  };
}

function tierThree(day: string, lift: string): SlotDecl {
  return {
    id: `${day}-${lift}`,
    lift,
    role: 'assistance',
    scheme: {
      kind: 'repeat',
      count: 3,
      reps: 15,
      amrapLast: true,
      minReps: 15,
      load: { kind: 'pct', pct: 1, of: 'workingWeight' },
    },
  };
}

const DAYS: DayDecl[] = [
  {
    key: 'a1',
    name: 'Day 1',
    slots: [tierOne('a1', 'squat-t1'), tierTwo('a1', 'bench-t2'), tierThree('a1', 'pulldown-t3')],
  },
  {
    key: 'b1',
    name: 'Day 2',
    slots: [tierOne('b1', 'ohp-t1'), tierTwo('b1', 'deadlift-t2'), tierThree('b1', 'row-t3')],
  },
  {
    key: 'a2',
    name: 'Day 3',
    slots: [tierOne('a2', 'bench-t1'), tierTwo('a2', 'squat-t2'), tierThree('a2', 'pulldown-t3')],
  },
  {
    key: 'b2',
    name: 'Day 4',
    slots: [tierOne('b2', 'deadlift-t1'), tierTwo('b2', 'ohp-t2'), tierThree('b2', 'row-t3')],
  },
];

function slotsOf(lift: string): string[] {
  return DAYS.flatMap((day) => day.slots.filter((slot) => slot.lift === lift).map((slot) => slot.id));
}

function tierOneRule(lift: string, increment: { kg: number; lb: number }): ProgressionRule {
  return {
    lift,
    var: 'workingWeight',
    trigger: 'afterSession',
    judgedSlots: slotsOf(lift),
    onMet: [{ kind: 'increment', by: increment }],
    onMiss: [{ kind: 'stageMachine', onLastFail: { kind: 'retest', pct: 0.85, from: 'fiveRm' } }],
  };
}

function tierTwoRule(lift: string, increment: { kg: number; lb: number }): ProgressionRule {
  return {
    lift,
    var: 'workingWeight',
    trigger: 'afterSession',
    judgedSlots: slotsOf(lift),
    onMet: [{ kind: 'increment', by: increment }],
    onMiss: [{ kind: 'stageMachine', onLastFail: { kind: 'resetToFirstStage', add: { kg: 6.25, lb: 15 } } }],
  };
}

function tierThreeRule(lift: string): ProgressionRule {
  return {
    lift,
    var: 'workingWeight',
    trigger: 'afterSession',
    judgedSlots: slotsOf(lift),
    onMet: [{ kind: 'amrapThreshold', setIndex: 2, reps: 25 }],
    onMiss: [{ kind: 'hold' }],
  };
}

export const GZCLP_LIFTS = [
  'squat-t1',
  'bench-t1',
  'ohp-t1',
  'deadlift-t1',
  'squat-t2',
  'bench-t2',
  'ohp-t2',
  'deadlift-t2',
  'pulldown-t3',
  'row-t3',
] as const;
export type GzclpLift = (typeof GZCLP_LIFTS)[number];

const LIFT_NAMES: Readonly<Record<GzclpLift, string>> = {
  'squat-t1': 'Squat T1',
  'bench-t1': 'Bench press T1',
  'ohp-t1': 'Overhead press T1',
  'deadlift-t1': 'Deadlift T1',
  'squat-t2': 'Squat T2',
  'bench-t2': 'Bench press T2',
  'ohp-t2': 'Overhead press T2',
  'deadlift-t2': 'Deadlift T2',
  'pulldown-t3': 'Lat pulldown T3',
  'row-t3': 'Dumbbell row T3',
};

export const GZCLP: ProgramDefinition = {
  key: 'gzclp',
  version: 2,
  name: 'GZCLP',
  source: [GZCLP_WIKI, GZCL_ARCHIVE],
  lifts: GZCLP_LIFTS.map((key) => ({
    key,
    name: LIFT_NAMES[key],
    category: key.startsWith('squat') || key.startsWith('deadlift') ? ('lower' as const) : ('upper' as const),
    ...(key.endsWith('-t3') ? { barbell: false } : {}),
  })),
  inputs: [{ lifts: [...GZCLP_LIFTS], kinds: ['workingWeight'] }],
  referenceVars: ['workingWeight', 'fiveRm'],
  initial: [{ kind: 'copy', var: 'workingWeight', from: 'workingWeight' }],
  options: [],
  conversions: [
    { lb: 5, kg: 2.5, note: 'upper-body increment' },
    { lb: 10, kg: 5, note: 'lower-body increment' },
    { lb: 15, kg: 6.25, note: 'T2 reset add-on' },
  ],
  schedule: { kind: 'rotation', days: DAYS },
  progression: [
    tierOneRule('squat-t1', LOWER),
    tierOneRule('deadlift-t1', LOWER),
    tierOneRule('bench-t1', UPPER),
    tierOneRule('ohp-t1', UPPER),
    tierTwoRule('squat-t2', LOWER),
    tierTwoRule('deadlift-t2', LOWER),
    tierTwoRule('bench-t2', UPPER),
    tierTwoRule('ohp-t2', UPPER),
    tierThreeRule('pulldown-t3'),
    tierThreeRule('row-t3'),
  ],
};

export const GZCLP_EXERCISES: Readonly<Record<GzclpLift, string>> = {
  'squat-t1': 'squat',
  'bench-t1': 'bench',
  'ohp-t1': 'ohp',
  'deadlift-t1': 'deadlift',
  'squat-t2': 'squat',
  'bench-t2': 'bench',
  'ohp-t2': 'ohp',
  'deadlift-t2': 'deadlift',
  'pulldown-t3': 'lat-pulldown',
  'row-t3': 'dumbbell-row',
};

export const GZCLP_DEFAULT_WEIGHTS_KG: Readonly<Record<GzclpLift, number>> = {
  'squat-t1': 100,
  'bench-t1': 60,
  'ohp-t1': 40,
  'deadlift-t1': 120,
  'squat-t2': 70,
  'bench-t2': 50,
  'ohp-t2': 30,
  'deadlift-t2': 90,
  'pulldown-t3': 40,
  'row-t3': 20,
};

export interface GzclpEnrollmentOverrides {
  unit?: WeightUnit;
  weights?: Partial<Record<GzclpLift, number>>;
  rounding?: RoundingSetting;
}

export function gzclpEnrollment(overrides: GzclpEnrollmentOverrides = {}): ProgramEnrollment {
  const unit = overrides.unit ?? 'kg';
  const weights = { ...GZCLP_DEFAULT_WEIGHTS_KG, ...overrides.weights };
  return {
    id: 'enrollment-gzclp',
    unit,
    options: {},
    bindings: { ...GZCLP_EXERCISES },
    inputs: Object.fromEntries(GZCLP_LIFTS.map((lift) => [lift, { workingWeight: weights[lift] }])),
    rounding: overrides.rounding ?? DEFAULT_ROUNDING[unit],
  };
}
