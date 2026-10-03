import {
  DEFAULT_ROUNDING,
  type LiftDecl,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type SetSpec,
  type SlotDecl,
  type WeeklyPosition,
  type WeightUnit,
} from '@domain/index.ts';

const LIFTOSAUR_NSUNS = 'https://www.liftosaur.com/programs/nsuns';
const FITNESS_WIKI_NSUNS = 'https://thefitness.wiki/routines/nsuns-lp/';

export const NSUNS_TM_LIFTS = ['bench', 'squat', 'press', 'deadlift'] as const;
export type NsunsTmLift = (typeof NSUNS_TM_LIFTS)[number];

export const NSUNS_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type NsunsDay = (typeof NSUNS_DAYS)[number];

const LIFT_DECLS: LiftDecl[] = [
  { key: 'bench', name: 'Bench press', category: 'upper' },
  { key: 'squat', name: 'Squat', category: 'lower' },
  { key: 'press', name: 'Overhead press', category: 'upper' },
  { key: 'deadlift', name: 'Deadlift', category: 'lower' },
  { key: 'sumo-deadlift', name: 'Sumo deadlift', category: 'lower' },
  { key: 'incline-bench', name: 'Incline bench press', category: 'upper' },
  { key: 'front-squat', name: 'Front squat', category: 'lower' },
  { key: 'close-grip-bench', name: 'Close-grip bench press', category: 'upper' },
];

type Row = [reps: number, pct: number, amrap?: 'amrap'];

const BENCH_VOLUME: Row[] = [
  [8, 0.65],
  [6, 0.75],
  [4, 0.85],
  [4, 0.85],
  [4, 0.85],
  [5, 0.8],
  [6, 0.75],
  [7, 0.7],
  [8, 0.65, 'amrap'],
];

const HEAVY: Row[] = [
  [5, 0.75],
  [3, 0.85],
  [1, 0.95, 'amrap'],
  [3, 0.9],
  [3, 0.85],
  [3, 0.8],
  [5, 0.75],
  [5, 0.7],
  [5, 0.65, 'amrap'],
];

const DEADLIFT: Row[] = [
  [5, 0.75],
  [3, 0.85],
  [1, 0.95, 'amrap'],
  [3, 0.9],
  [3, 0.85],
  [3, 0.8],
  [3, 0.75],
  [3, 0.7],
  [3, 0.65, 'amrap'],
];

const T2_REPS = [6, 5, 3, 5, 7, 4, 6, 8];
const T2_SUMO_REPS = [5, 5, 3, 5, 7, 4, 6, 8];
const T2_FRONT_SQUAT_REPS = [5, 5, 3, 5, 7, 4, 6, 8];

function t2Rows(reps: readonly number[], first: number, second: number, rest: number): Row[] {
  return reps.map((count, index): Row => [count, index === 0 ? first : index === 1 ? second : rest]);
}

function setsOf(rows: readonly Row[], tmLift: NsunsTmLift | null): SetSpec[] {
  return rows.map(([reps, pct, amrap]) => ({
    reps,
    load: tmLift ? { kind: 'pct', pct, of: 'tm', lift: tmLift } : { kind: 'pct', pct, of: 'tm' },
    ...(amrap ? { amrap: true, minReps: reps } : {}),
  }));
}

function slot(day: NsunsDay, lift: string, role: 'main' | 'supplemental', sets: SetSpec[]): SlotDecl {
  return { id: `${day}-${lift}`, lift, role, scheme: { kind: 'sets', sets } };
}

const BANDS: [number, { kg: number; lb: number }][] = [
  [0, { kg: 0, lb: 0 }],
  [2, { kg: 2.5, lb: 5 }],
  [4, { kg: 5, lb: 10 }],
  [6, { kg: 6.25, lb: 15 }],
];

function amrapRule(lift: NsunsTmLift, slotId: string): ProgressionRule {
  return {
    lift,
    var: 'tm',
    trigger: 'endOfWeek',
    judgedSlots: [slotId],
    onMet: [],
    onMiss: [],
    always: [{ kind: 'amrapTable', setIndex: 2, bands: BANDS }],
  };
}

export const NSUNS_5DAY: ProgramDefinition = {
  key: 'nsuns_5day',
  version: 1,
  name: 'nSuns LP 5-day',
  source: [LIFTOSAUR_NSUNS, FITNESS_WIKI_NSUNS],
  lifts: LIFT_DECLS,
  inputs: [{ lifts: [...NSUNS_TM_LIFTS], kinds: ['tm', 'oneRm'] }],
  referenceVars: ['tm'],
  initial: [
    { kind: 'copy', var: 'tm', from: 'tm' },
    { kind: 'scale', var: 'tm', from: 'oneRm', factor: 0.9 },
  ],
  options: [],
  conversions: [
    { lb: 5, kg: 2.5, note: 'TM increase for 2–3 AMRAP reps' },
    { lb: 10, kg: 5, note: 'TM increase for 4–5 AMRAP reps' },
    { lb: 15, kg: 6.25, note: 'TM increase for 6 or more AMRAP reps' },
  ],
  schedule: {
    kind: 'weekly',
    days: [
      {
        key: 'mon',
        name: 'Monday',
        slots: [
          slot('mon', 'bench', 'main', setsOf(BENCH_VOLUME, null)),
          slot('mon', 'press', 'supplemental', setsOf(t2Rows(T2_REPS, 0.5, 0.6, 0.7), null)),
        ],
      },
      {
        key: 'tue',
        name: 'Tuesday',
        slots: [
          slot('tue', 'squat', 'main', setsOf(HEAVY, null)),
          slot('tue', 'sumo-deadlift', 'supplemental', setsOf(t2Rows(T2_SUMO_REPS, 0.5, 0.6, 0.7), 'deadlift')),
        ],
      },
      {
        key: 'wed',
        name: 'Wednesday',
        slots: [
          slot('wed', 'press', 'main', setsOf(HEAVY, null)),
          slot('wed', 'incline-bench', 'supplemental', setsOf(t2Rows(T2_REPS, 0.4, 0.5, 0.6), 'bench')),
        ],
      },
      {
        key: 'thu',
        name: 'Thursday',
        slots: [
          slot('thu', 'deadlift', 'main', setsOf(DEADLIFT, null)),
          slot('thu', 'front-squat', 'supplemental', setsOf(t2Rows(T2_FRONT_SQUAT_REPS, 0.35, 0.45, 0.55), 'squat')),
        ],
      },
      {
        key: 'fri',
        name: 'Friday',
        slots: [
          slot('fri', 'bench', 'main', setsOf(HEAVY, null)),
          slot('fri', 'close-grip-bench', 'supplemental', setsOf(t2Rows(T2_REPS, 0.4, 0.5, 0.6), 'bench')),
        ],
      },
    ],
  },
  progression: [
    amrapRule('bench', 'fri-bench'),
    amrapRule('squat', 'tue-squat'),
    amrapRule('press', 'wed-press'),
    amrapRule('deadlift', 'thu-deadlift'),
  ],
};

export const NSUNS_DEFAULT_TMS_KG: Readonly<Record<NsunsTmLift, number>> = {
  bench: 100,
  squat: 140,
  press: 60,
  deadlift: 200,
};

export function nsunsEnrollment(
  tms: Partial<Record<NsunsTmLift, number>> = {},
  unit: WeightUnit = 'kg',
): ProgramEnrollment {
  const all = { ...NSUNS_DEFAULT_TMS_KG, ...tms };
  return {
    id: 'enrollment-nsuns',
    unit,
    options: {},
    bindings: Object.fromEntries(LIFT_DECLS.map((lift) => [lift.key, lift.key])),
    inputs: Object.fromEntries(NSUNS_TM_LIFTS.map((lift) => [lift, { tm: all[lift] }])),
    rounding: DEFAULT_ROUNDING[unit],
  };
}

export function nsunsDay(week: number, day: NsunsDay): WeeklyPosition {
  return { week, day };
}
