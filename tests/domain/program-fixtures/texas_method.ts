import {
  DEFAULT_ROUNDING,
  type OptionValue,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type WeeklyPosition,
  type WeightUnit,
} from '@domain/index.ts';

const LIFTOSAUR_TEXAS = 'https://www.liftosaur.com/programs/texasmethod';
const FITNESSVOLT_TEXAS = 'https://fitnessvolt.com/rpe-training/programs/texas-method/';

export const TEXAS_DAYS = ['mon', 'wed', 'fri'] as const;
export type TexasDay = (typeof TEXAS_DAYS)[number];

const WEEKLY_INCREMENT = { kg: 2.5, lb: 5 };

function intensityRule(lift: 'squat' | 'press'): ProgressionRule {
  return {
    lift,
    var: 'fiveRm',
    trigger: 'endOfWeek',
    judgedSlots: [`fri-${lift}`],
    onMet: [{ kind: 'increment', by: WEEKLY_INCREMENT }],
    onMiss: [{ kind: 'hold' }],
  };
}

export const TEXAS_METHOD: ProgramDefinition = {
  key: 'texas_method',
  version: 1,
  name: 'Texas Method',
  source: [LIFTOSAUR_TEXAS, FITNESSVOLT_TEXAS],
  lifts: [
    { key: 'squat', name: 'Squat', category: 'lower' },
    { key: 'press', name: 'Bench press or overhead press', category: 'upper' },
    { key: 'deadlift', name: 'Deadlift', category: 'lower' },
  ],
  inputs: [
    { lifts: ['squat', 'press'], kinds: ['fiveRm'] },
    { lifts: ['deadlift'], kinds: ['workingWeight'] },
  ],
  referenceVars: ['fiveRm', 'workingWeight'],
  initial: [
    { kind: 'copy', var: 'fiveRm', from: 'fiveRm' },
    { kind: 'copy', var: 'workingWeight', from: 'workingWeight' },
  ],
  options: [
    { key: 'pressLift', kind: 'choice', values: ['bench', 'ohp'], default: 'bench', source: [LIFTOSAUR_TEXAS] },
  ],
  conversions: [{ lb: 5, kg: 2.5, note: 'weekly increase of the Friday 5RM' }],
  schedule: {
    kind: 'weekly',
    days: [
      {
        key: 'mon',
        name: 'Volume day',
        slots: [
          {
            id: 'mon-squat',
            lift: 'squat',
            role: 'main',
            scheme: { kind: 'repeat', count: 5, reps: 5, load: { kind: 'pct', pct: 0.9, of: 'fiveRm' } },
          },
          {
            id: 'mon-press',
            lift: 'press',
            role: 'main',
            scheme: { kind: 'repeat', count: 5, reps: 5, load: { kind: 'pct', pct: 0.9, of: 'fiveRm' } },
          },
          {
            id: 'mon-deadlift',
            lift: 'deadlift',
            role: 'main',
            scheme: { kind: 'repeat', count: 1, reps: 5, load: { kind: 'pct', pct: 1, of: 'workingWeight' } },
          },
        ],
      },
      {
        key: 'wed',
        name: 'Recovery day',
        slots: [
          {
            id: 'wed-squat',
            lift: 'squat',
            role: 'main',
            scheme: {
              kind: 'repeat',
              count: 2,
              reps: 5,
              load: { kind: 'pctOfSlot', day: 'mon', slot: 'mon-squat', idx: 0, pct: 0.8 },
            },
          },
        ],
      },
      {
        key: 'fri',
        name: 'Intensity day',
        slots: [
          {
            id: 'fri-squat',
            lift: 'squat',
            role: 'main',
            scheme: {
              kind: 'repeat',
              count: 1,
              reps: 5,
              load: { kind: 'pct', pct: 1, of: 'fiveRm', add: WEEKLY_INCREMENT },
            },
          },
          {
            id: 'fri-press',
            lift: 'press',
            role: 'main',
            scheme: {
              kind: 'repeat',
              count: 1,
              reps: 5,
              load: { kind: 'pct', pct: 1, of: 'fiveRm', add: WEEKLY_INCREMENT },
            },
          },
        ],
      },
    ],
  },
  progression: [intensityRule('squat'), intensityRule('press')],
};

export interface TexasEnrollmentOverrides {
  unit?: WeightUnit;
  squat?: number;
  press?: number;
  deadlift?: number;
  options?: Readonly<Record<string, OptionValue>>;
}

export function texasEnrollment(overrides: TexasEnrollmentOverrides = {}): ProgramEnrollment {
  const unit = overrides.unit ?? 'kg';
  return {
    id: 'enrollment-texas',
    unit,
    options: { pressLift: 'bench', ...overrides.options },
    bindings: { squat: 'squat', press: 'bench', deadlift: 'deadlift' },
    inputs: {
      squat: { fiveRm: overrides.squat ?? 150 },
      press: { fiveRm: overrides.press ?? 100 },
      deadlift: { workingWeight: overrides.deadlift ?? 180 },
    },
    rounding: DEFAULT_ROUNDING[unit],
  };
}

export function texasDay(week: number, day: TexasDay): WeeklyPosition {
  return { week, day };
}
