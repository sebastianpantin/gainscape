import {
  DEFAULT_ROUNDING,
  type DayDecl,
  type OptionValue,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type WeeklyPosition,
  type WeightUnit,
} from '@domain/index.ts';

const FITNESSVOLT_RTS_CHART = 'https://fitnessvolt.com/tuchscherer-chart-explained/';

export const RPE_LIFTS = ['squat', 'bench', 'deadlift'] as const;
export type RpeLift = (typeof RPE_LIFTS)[number];

const NAMES: Readonly<Record<RpeLift, string>> = { squat: 'Squat', bench: 'Bench press', deadlift: 'Deadlift' };

export const TOP_SET_REPS = 3;
export const TOP_SET_RPE = 8;

function liftDay(lift: RpeLift): DayDecl {
  const top = `${lift}-top:0`;
  return {
    key: lift,
    name: NAMES[lift],
    slots: [
      {
        id: `${lift}-top`,
        lift,
        role: 'main',
        scheme: {
          kind: 'sets',
          sets: [{ reps: TOP_SET_REPS, load: { kind: 'rpeLoad', reps: TOP_SET_REPS, rpe: TOP_SET_RPE, of: 'e1rm' } }],
        },
      },
      {
        id: `${lift}-fatigue`,
        lift,
        role: 'supplemental',
        when: [{ option: 'backoff', equals: 'fatigue' }],
        scheme: {
          kind: 'repeat',
          count: 5,
          reps: TOP_SET_REPS,
          optional: true,
          load: { kind: 'pctOfSet', ref: top, pct: { option: 'fatigueBackoffPct' } },
        },
      },
      {
        id: `${lift}-fixed`,
        lift,
        role: 'supplemental',
        when: [{ option: 'backoff', equals: 'fixed' }],
        scheme: {
          kind: 'repeat',
          count: 3,
          reps: TOP_SET_REPS,
          load: { kind: 'pctOfSet', ref: top, pct: { option: 'fixedBackoffPct' } },
        },
      },
    ],
  };
}

function e1rmRule(lift: RpeLift): ProgressionRule {
  return {
    lift,
    var: 'e1rm',
    trigger: 'afterSession',
    judgedSlots: [`${lift}-top`],
    onMet: [],
    onMiss: [],
    always: [{ kind: 'e1rmFromSet', setIndex: 0 }],
  };
}

export const RPE_TOP_SET: ProgramDefinition = {
  key: 'rpe_top_set',
  version: 1,
  name: 'RPE top set with back-offs',
  source: [FITNESSVOLT_RTS_CHART],
  lifts: RPE_LIFTS.map((lift) => ({ key: lift, name: NAMES[lift], category: lift === 'bench' ? 'upper' : 'lower' })),
  inputs: [{ lifts: [...RPE_LIFTS], kinds: ['e1rm'] }],
  referenceVars: ['e1rm'],
  initial: [{ kind: 'copy', var: 'e1rm', from: 'e1rm' }],
  options: [
    {
      key: 'backoff',
      kind: 'choice',
      values: ['fatigue', 'fixed'],
      default: 'fatigue',
      source: [FITNESSVOLT_RTS_CHART],
    },
    {
      key: 'fatigueBackoffPct',
      kind: 'choice',
      values: [0.95, 0.925, 0.9],
      default: 0.95,
      source: [FITNESSVOLT_RTS_CHART],
    },
    {
      key: 'fixedBackoffPct',
      kind: 'choice',
      values: [0.95, 0.925, 0.9],
      default: 0.925,
      source: [FITNESSVOLT_RTS_CHART],
    },
  ],
  schedule: { kind: 'weekly', days: RPE_LIFTS.map(liftDay) },
  progression: RPE_LIFTS.map(e1rmRule),
};

export interface RpeEnrollmentOverrides {
  unit?: WeightUnit;
  e1rms?: Partial<Record<RpeLift, number>>;
  options?: Readonly<Record<string, OptionValue>>;
}

export function rpeEnrollment(overrides: RpeEnrollmentOverrides = {}): ProgramEnrollment {
  const unit = overrides.unit ?? 'kg';
  const e1rms = { squat: 200, bench: 120, deadlift: 240, ...overrides.e1rms };
  return {
    id: 'enrollment-rpe',
    unit,
    options: { backoff: 'fatigue', fatigueBackoffPct: 0.95, fixedBackoffPct: 0.925, ...overrides.options },
    bindings: Object.fromEntries(RPE_LIFTS.map((lift) => [lift, lift])),
    inputs: Object.fromEntries(RPE_LIFTS.map((lift) => [lift, { e1rm: e1rms[lift] }])),
    rounding: DEFAULT_ROUNDING[unit],
  };
}

export function rpeDay(week: number, lift: RpeLift): WeeklyPosition {
  return { week, day: lift };
}
