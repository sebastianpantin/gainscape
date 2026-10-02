import { type DayDecl, type ProgramDefinition, type ProgressionRule, type SlotDecl } from '@domain/index.ts';

const GZCLP_WIKI = 'thefitness.wiki/routines/gzclp';
const GZCL_ARCHIVE = 'thefitness.wiki/reddit-archive/gzcl-method-novice-to-elite';

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
    name: 'A1',
    slots: [tierOne('a1', 'squat-t1'), tierTwo('a1', 'bench-t2'), tierThree('a1', 'pulldown-t3')],
  },
  {
    key: 'b1',
    name: 'B1',
    slots: [tierOne('b1', 'ohp-t1'), tierTwo('b1', 'deadlift-t2'), tierThree('b1', 'row-t3')],
  },
  {
    key: 'a2',
    name: 'A2',
    slots: [tierOne('a2', 'bench-t1'), tierTwo('a2', 'squat-t2'), tierThree('a2', 'pulldown-t3')],
  },
  {
    key: 'b2',
    name: 'B2',
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
    onMiss: [{ kind: 'stageMachine', onLastFail: { kind: 'retest', pct: 0.85 } }],
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

const LIFT_KEYS = [
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
];

export const GZCLP_SHAPE: ProgramDefinition = {
  key: 'gzclp',
  version: 1,
  name: 'GZCLP',
  source: [GZCLP_WIKI, GZCL_ARCHIVE],
  lifts: LIFT_KEYS.map((key) => ({
    key,
    name: key,
    ...(key.startsWith('squat') || key.startsWith('deadlift') ? { category: 'lower' as const } : {}),
  })),
  inputs: [{ lifts: LIFT_KEYS, kinds: ['workingWeight'] }],
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
