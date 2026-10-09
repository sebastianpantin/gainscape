import {
  DEFAULT_ROUNDING,
  type FactSet,
  type LiftDecl,
  type OptionValue,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgressionRule,
  type RoundingSetting,
  type SetSpec,
  type SlotDecl,
  type WeeklyPosition,
  type WeightUnit,
} from '@domain/index.ts';
import { type FactClock, sessionFact, setAsPrescribed, skipDayFact } from './facts.ts';

const MADCOW_PRIMARY = 'https://www.oocities.org/elitemadcow1/5x5_Program/Linear_5x5.htm';
const STRENGTHLOG_MADCOW = 'https://www.strengthlog.com/madcow-5x5/';

export const MADCOW_MAIN_LIFTS = ['squat', 'bench', 'row', 'press', 'deadlift'] as const;
export type MadcowMainLift = (typeof MADCOW_MAIN_LIFTS)[number];
export const MADCOW_DAYS = ['mon', 'wed', 'fri'] as const;
export type MadcowDay = (typeof MADCOW_DAYS)[number];

export const MADCOW_EXERCISES: Readonly<Record<string, string>> = {
  squat: 'squat',
  bench: 'bench',
  row: 'row',
  press: 'ohp',
  deadlift: 'deadlift',
  hyper: 'weighted-hyper',
  situp: 'weighted-situp',
  dip: 'weighted-dip',
  curl: 'curl',
  triceps: 'triceps-extension',
};

const LIFT_DECLS: LiftDecl[] = [
  { key: 'squat', name: 'Squat', category: 'lower' },
  { key: 'bench', name: 'Bench press', category: 'upper' },
  { key: 'row', name: 'Barbell row', category: 'upper' },
  { key: 'press', name: 'Incline or military press', category: 'upper' },
  { key: 'deadlift', name: 'Deadlift', category: 'lower' },
  { key: 'hyper', name: 'Weighted hyperextension' },
  { key: 'situp', name: 'Weighted sit-up' },
  { key: 'dip', name: 'Weighted dip' },
  { key: 'curl', name: 'Curl' },
  { key: 'triceps', name: 'Triceps extension' },
];

const RAMP_STEP = { option: 'rampStep' };
const MONDAY_RAMP_SETS = 5;
const WEDNESDAY_RAMP_SETS = 4;
const MONDAY_TOP_SET_INDEX = MONDAY_RAMP_SETS - 1;
const WEDNESDAY_TOP_SET_INDEX = WEDNESDAY_RAMP_SETS - 1;

function mondayRamp(lift: MadcowMainLift): SlotDecl {
  return {
    id: `mon-${lift}`,
    lift,
    role: 'main',
    scheme: {
      kind: 'repeat',
      count: MONDAY_RAMP_SETS,
      reps: 5,
      load: { kind: 'ramp', step: RAMP_STEP, count: MONDAY_RAMP_SETS, of: 'top' },
    },
  };
}

function wednesdayRamp(lift: MadcowMainLift): SlotDecl {
  return {
    id: `wed-${lift}`,
    lift,
    role: 'main',
    scheme: {
      kind: 'repeat',
      count: WEDNESDAY_RAMP_SETS,
      reps: 5,
      load: { kind: 'ramp', step: RAMP_STEP, count: WEDNESDAY_RAMP_SETS, of: 'top' },
    },
  };
}

function sameAsMonday(lift: MadcowMainLift, index: number, reps: number): SetSpec {
  return { reps, load: { kind: 'sameAs', ref: `mon-${lift}:${index}` } };
}

function fridaySlot(lift: MadcowMainLift): SlotDecl {
  return {
    id: `fri-${lift}`,
    lift,
    role: 'main',
    scheme: {
      kind: 'sets',
      sets: [
        sameAsMonday(lift, 0, 5),
        sameAsMonday(lift, 1, 5),
        sameAsMonday(lift, 2, 5),
        sameAsMonday(lift, 3, 5),
        { reps: 3, load: { kind: 'pct', pct: 1.025, of: 'top' } },
        sameAsMonday(lift, 2, 8),
      ],
    },
  };
}

function assistance(id: string, lift: string, count: number, reps: number | null, maxReps?: number): SlotDecl {
  return {
    id,
    lift,
    role: 'assistance',
    scheme: {
      kind: 'repeat',
      count,
      reps,
      ...(maxReps === undefined ? {} : { maxReps }),
      load: { kind: 'lastLogged' },
      optional: true,
    },
  };
}

function weeklyRule(lift: MadcowMainLift, judgedSlot: string, topSetIndex: number): ProgressionRule {
  return {
    lift,
    var: 'top',
    trigger: 'endOfWeek',
    judgedSlots: [judgedSlot],
    judgedSets: [topSetIndex],
    onMet: [{ kind: 'increment', byPct: 0.025 }],
    onMiss: [{ kind: 'hold' }],
  };
}

export const MADCOW_5X5: ProgramDefinition = {
  key: 'madcow_5x5',
  version: 1,
  name: 'Madcow 5x5',
  source: [MADCOW_PRIMARY, STRENGTHLOG_MADCOW],
  lifts: LIFT_DECLS,
  inputs: [{ lifts: [...MADCOW_MAIN_LIFTS], kinds: ['fiveRm'] }],
  referenceVars: ['top'],
  initial: [{ kind: 'onRamp', var: 'top', from: 'fiveRm', factor: 0.975, peakWeek: 4 }],
  options: [{ key: 'rampStep', kind: 'choice', values: [0.1, 0.125, 0.15], default: 0.125, source: [MADCOW_PRIMARY] }],
  schedule: {
    kind: 'weekly',
    days: [
      {
        key: 'mon',
        name: 'Day 1',
        slots: [
          mondayRamp('squat'),
          mondayRamp('bench'),
          mondayRamp('row'),
          assistance('mon-hyper', 'hyper', 2, null),
          assistance('mon-situp', 'situp', 4, null),
        ],
      },
      {
        key: 'wed',
        name: 'Day 2',
        slots: [
          {
            id: 'wed-squat',
            lift: 'squat',
            role: 'main',
            scheme: {
              kind: 'sets',
              sets: [
                sameAsMonday('squat', 0, 5),
                sameAsMonday('squat', 1, 5),
                sameAsMonday('squat', 2, 5),
                sameAsMonday('squat', 2, 5),
              ],
            },
          },
          wednesdayRamp('press'),
          wednesdayRamp('deadlift'),
          assistance('wed-situp', 'situp', 3, null),
        ],
      },
      {
        key: 'fri',
        name: 'Day 3',
        slots: [
          fridaySlot('squat'),
          fridaySlot('bench'),
          fridaySlot('row'),
          assistance('fri-dip', 'dip', 3, 5, 8),
          assistance('fri-curl', 'curl', 3, null),
          assistance('fri-triceps', 'triceps', 3, 8),
        ],
      },
    ],
  },
  progression: [
    weeklyRule('squat', 'mon-squat', MONDAY_TOP_SET_INDEX),
    weeklyRule('bench', 'mon-bench', MONDAY_TOP_SET_INDEX),
    weeklyRule('row', 'mon-row', MONDAY_TOP_SET_INDEX),
    weeklyRule('press', 'wed-press', WEDNESDAY_TOP_SET_INDEX),
    weeklyRule('deadlift', 'wed-deadlift', WEDNESDAY_TOP_SET_INDEX),
  ],
};

export const MADCOW_DEFAULT_FIVE_RMS_KG: Readonly<Record<MadcowMainLift, number>> = {
  squat: 100,
  bench: 80,
  row: 70,
  press: 50,
  deadlift: 140,
};

export interface MadcowEnrollmentOverrides {
  unit?: WeightUnit;
  options?: Readonly<Record<string, OptionValue>>;
  fiveRms?: Partial<Record<MadcowMainLift, number>>;
  rounding?: RoundingSetting;
  bindings?: Readonly<Record<string, string | null>>;
}

export function madcowEnrollment(overrides: MadcowEnrollmentOverrides = {}): ProgramEnrollment {
  const unit = overrides.unit ?? 'kg';
  const fiveRms = { ...MADCOW_DEFAULT_FIVE_RMS_KG, ...overrides.fiveRms };
  return {
    id: 'enrollment-madcow',
    unit,
    options: { rampStep: 0.125, ...overrides.options },
    bindings: { ...MADCOW_EXERCISES, ...overrides.bindings },
    inputs: Object.fromEntries(MADCOW_MAIN_LIFTS.map((lift) => [lift, { fiveRm: fiveRms[lift] }])),
    rounding: overrides.rounding ?? DEFAULT_ROUNDING[unit],
  };
}

export function weekDay(week: number, day: MadcowDay): WeeklyPosition {
  return { week, day };
}

const SNAPSHOT_WEIGHT_KG = 80;

export function rampSets(slotId: string, lift: MadcowMainLift, count: number, topSetReps = 5): FactSet[] {
  return Array.from({ length: count }, (_, index) =>
    setAsPrescribed(
      MADCOW_EXERCISES[lift],
      `${slotId}:${index}`,
      { weightKg: SNAPSHOT_WEIGHT_KG, reps: 5 },
      index === count - 1 ? topSetReps : undefined,
    ),
  );
}

export function fridaySets(lift: MadcowMainLift, tripleReps = 3): FactSet[] {
  return [5, 5, 5, 5, 3, 8].map((reps, index) =>
    setAsPrescribed(
      MADCOW_EXERCISES[lift],
      `fri-${lift}:${index}`,
      { weightKg: SNAPSHOT_WEIGHT_KG, reps },
      index === 4 ? tripleReps : undefined,
    ),
  );
}

export function wednesdaySquatSets(lastSetReps = 5): FactSet[] {
  return [0, 1, 2, 3].map((index) =>
    setAsPrescribed(
      MADCOW_EXERCISES.squat,
      `wed-squat:${index}`,
      { weightKg: SNAPSHOT_WEIGHT_KG, reps: 5 },
      index === 3 ? lastSetReps : undefined,
    ),
  );
}

export interface MadcowWeekScript {
  mondayTopReps?: Partial<Record<'squat' | 'bench' | 'row', number>>;
  wednesdayTopReps?: Partial<Record<'press' | 'deadlift', number>>;
  wednesdaySquatLastReps?: number;
  fridayTripleReps?: Partial<Record<'squat' | 'bench' | 'row', number>>;
  skip?: readonly MadcowDay[];
  omit?: readonly MadcowDay[];
  order?: readonly MadcowDay[];
}

export function madcowDaySets(day: MadcowDay, script: MadcowWeekScript = {}): FactSet[] {
  if (day === 'mon') {
    return (['squat', 'bench', 'row'] as const).flatMap((lift) =>
      rampSets(`mon-${lift}`, lift, 5, script.mondayTopReps?.[lift]),
    );
  }
  if (day === 'wed') {
    return [
      ...wednesdaySquatSets(script.wednesdaySquatLastReps),
      ...rampSets('wed-press', 'press', 4, script.wednesdayTopReps?.press),
      ...rampSets('wed-deadlift', 'deadlift', 4, script.wednesdayTopReps?.deadlift),
    ];
  }
  return (['squat', 'bench', 'row'] as const).flatMap((lift) => fridaySets(lift, script.fridayTripleReps?.[lift]));
}

export function madcowWeek(clock: FactClock, week: number, script: MadcowWeekScript = {}): ProgramFact[] {
  const order = script.order ?? MADCOW_DAYS;
  return order
    .filter((day) => !script.omit?.includes(day))
    .map((day) =>
      script.skip?.includes(day)
        ? skipDayFact(clock.next(), weekDay(week, day))
        : sessionFact(clock.next(), weekDay(week, day), madcowDaySets(day, script)),
    );
}

export function metMadcowWeeks(clock: FactClock, weeks: readonly number[]): ProgramFact[] {
  return weeks.flatMap((week) => madcowWeek(clock, week));
}
