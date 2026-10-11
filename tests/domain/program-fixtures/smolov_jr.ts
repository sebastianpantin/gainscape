import {
  type CyclePosition,
  DEFAULT_ROUNDING,
  type ProgramDefinition,
  type ProgramEnrollment,
  type WeightUnit,
} from '@domain/index.ts';
import { type DayDecl } from '@domain/program-definition.ts';
import { type UnitAmount } from '@domain/units.ts';

const LIFTVAULT_SMOLOV = 'https://liftvault.com/programs/powerlifting/peaking/smolov/';
const LIFTOSAUR_SMOLOV_JR = 'https://www.liftosaur.com/programs/smolov-jr';

export const SMOLOV_JR_DAYS = ['mon', 'wed', 'fri', 'sat'] as const;
export type SmolovJrDay = (typeof SMOLOV_JR_DAYS)[number];

const ADD_ONS_BY_WEEK: UnitAmount[] = [
  { kg: 0, lb: 0 },
  { kg: 5, lb: 10 },
  { kg: 8.75, lb: 20 },
];

function smolovDay(key: SmolovJrDay, name: string, sets: number, reps: number, pct: number): DayDecl {
  return {
    key,
    name,
    slots: [
      {
        id: `${key}-main`,
        lift: 'main',
        role: 'main',
        scheme: {
          kind: 'repeat',
          count: sets,
          reps,
          load: { kind: 'cumulativeAddOn', pct, of: 'tm', byWeek: ADD_ONS_BY_WEEK },
        },
      },
    ],
  };
}

export const SMOLOV_JR: ProgramDefinition = {
  key: 'smolov_jr',
  version: 1,
  name: 'Smolov Jr',
  source: [LIFTVAULT_SMOLOV, LIFTOSAUR_SMOLOV_JR],
  lifts: [{ key: 'main', name: 'Main lift' }],
  inputs: [{ lifts: ['main'], kinds: ['oneRm'] }],
  referenceVars: ['tm'],
  initial: [{ kind: 'copy', var: 'tm', from: 'oneRm' }],
  options: [],
  conversions: [
    { lb: 10, kg: 5, note: 'week 2 add-on' },
    { lb: 20, kg: 8.75, note: 'week 3 cumulative add-on' },
  ],
  schedule: {
    kind: 'cycle',
    weeksPerCycle: 3,
    days: [
      smolovDay('mon', 'Day 1', 6, 6, 0.7),
      smolovDay('wed', 'Day 2', 7, 5, 0.75),
      smolovDay('fri', 'Day 3', 8, 4, 0.8),
      smolovDay('sat', 'Day 4', 10, 3, 0.85),
    ],
  },
  progression: [],
};

export function smolovJrEnrollment(oneRm = 200, unit: WeightUnit = 'kg'): ProgramEnrollment {
  return {
    id: 'enrollment-smolov-jr',
    unit,
    options: {},
    bindings: { main: 'squat' },
    inputs: { main: { oneRm } },
    rounding: DEFAULT_ROUNDING[unit],
  };
}

export function smolovJrDay(week: number, day: SmolovJrDay, cycle = 1): CyclePosition {
  return { cycle, week, day };
}
