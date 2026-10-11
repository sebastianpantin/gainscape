import {
  type CyclePosition,
  DEFAULT_ROUNDING,
  type OptionValue,
  type ProgramDefinition,
  type ProgramEnrollment,
  type WeightUnit,
} from '@domain/index.ts';
import {
  type DayDecl,
  type LiftCategory,
  type ProgressionRule,
  type UnitAmountExpr,
  type WeekTableRow,
  type WeekTableSet,
} from '@domain/program-definition.ts';

const JUGGERNAUT_BOOK = 'https://pdfcoffee.com/juggernaut-method-20-pdf-free.html';
const JTS_GOING_HEAVY = 'https://www.jtsstrength.com/going-heavy-on-the-juggernaut-method/';
const LIFTOSAUR_JUGGERNAUT = 'https://www.liftosaur.com/programs/juggernaut-method';
const LIFTVAULT_JUGGERNAUT_TM = 'https://liftvault.com/programs/strength/juggernaut-method-base-template-spreadsheet/';

export const JUGGERNAUT_LIFTS = ['squat', 'bench', 'deadlift', 'press'] as const;
export type JuggernautLift = (typeof JUGGERNAUT_LIFTS)[number];

const CATEGORY: Readonly<Record<JuggernautLift, LiftCategory>> = {
  squat: 'lower',
  bench: 'upper',
  deadlift: 'lower',
  press: 'upper',
};

const NAMES: Readonly<Record<JuggernautLift, string>> = {
  squat: 'Squat',
  bench: 'Bench press',
  deadlift: 'Deadlift',
  press: 'Overhead press',
};

interface Wave {
  reps: number;
  accumulation: { sets: number; pct: number };
  intensification: { sets: number; pct: number };
  realizationPct: number;
}

const WAVES: readonly Wave[] = [
  { reps: 10, accumulation: { sets: 5, pct: 0.6 }, intensification: { sets: 3, pct: 0.675 }, realizationPct: 0.75 },
  { reps: 8, accumulation: { sets: 5, pct: 0.65 }, intensification: { sets: 3, pct: 0.725 }, realizationPct: 0.8 },
  { reps: 5, accumulation: { sets: 6, pct: 0.7 }, intensification: { sets: 4, pct: 0.775 }, realizationPct: 0.85 },
  { reps: 3, accumulation: { sets: 7, pct: 0.75 }, intensification: { sets: 5, pct: 0.825 }, realizationPct: 0.9 },
];

export const JUGGERNAUT_REP_STANDARDS = WAVES.map((wave) => wave.reps);

export const JUGGERNAUT_REALIZATION_WEEKS = [3, 7, 11, 15];

function straightSets(count: number, reps: number, pct: number, amrapLast: boolean): WeekTableSet[] {
  return Array.from({ length: count }, (_, index) =>
    amrapLast && index === count - 1 ? { pct, reps, amrap: true, minReps: reps } : { pct, reps },
  );
}

const DELOAD_ROW: WeekTableRow = {
  sets: [
    { pct: 0.4, reps: 5 },
    { pct: 0.5, reps: 5 },
    { pct: 0.6, reps: 5 },
  ],
};

function waveRows(wave: Wave): WeekTableRow[] {
  return [
    { sets: straightSets(wave.accumulation.sets, wave.reps, wave.accumulation.pct, true) },
    { sets: straightSets(wave.intensification.sets, wave.reps, wave.intensification.pct, false) },
    { sets: straightSets(1, wave.reps, wave.realizationPct, true) },
    DELOAD_ROW,
  ];
}

const PER_REP: Readonly<Record<LiftCategory, UnitAmountExpr>> = {
  lower: { option: 'perRep', cases: { standard: { kg: 2.5, lb: 5 }, fine: { kg: 1.25, lb: 2.5 } } },
  upper: { option: 'perRep', cases: { standard: { kg: 1.25, lb: 2.5 }, fine: { kg: 0, lb: 1.25 } } },
};

function mainDay(lift: JuggernautLift, index: number): DayDecl {
  return {
    key: lift,
    name: `Day ${index + 1}`,
    slots: [{ id: `${lift}-main`, lift, role: 'main', scheme: { kind: 'weekTable', table: 'waves', of: 'tm' } }],
  };
}

function waveRule(lift: JuggernautLift): ProgressionRule {
  return {
    lift,
    var: 'tm',
    trigger: 'endOfWave',
    judgedSlots: [`${lift}-main`],
    judgedWeeks: JUGGERNAUT_REALIZATION_WEEKS,
    onMet: [],
    onMiss: [],
    always: [
      {
        kind: 'repsOverStandard',
        setIndex: 0,
        standardByWave: JUGGERNAUT_REP_STANDARDS,
        perRep: PER_REP[CATEGORY[lift]],
        cap: 10,
      },
    ],
  };
}

export const JUGGERNAUT_2: ProgramDefinition = {
  key: 'juggernaut_2',
  version: 1,
  name: 'Juggernaut Method 2.0 (structure)',
  source: [JUGGERNAUT_BOOK, JTS_GOING_HEAVY, LIFTOSAUR_JUGGERNAUT, LIFTVAULT_JUGGERNAUT_TM],
  lifts: JUGGERNAUT_LIFTS.map((lift) => ({ key: lift, name: NAMES[lift], category: CATEGORY[lift] })),
  inputs: [{ lifts: [...JUGGERNAUT_LIFTS], kinds: ['tm', 'oneRm'] }],
  referenceVars: ['tm'],
  initial: [
    { kind: 'copy', var: 'tm', from: 'tm' },
    { kind: 'scale', var: 'tm', from: 'oneRm', factor: 0.9 },
  ],
  options: [
    {
      key: 'perRep',
      kind: 'choice',
      values: ['standard', 'fine'],
      default: 'standard',
      onlyForUnit: { fine: 'lb' },
      source: [JUGGERNAUT_BOOK, LIFTOSAUR_JUGGERNAUT],
    },
  ],
  conversions: [
    { lb: 5, kg: 2.5, note: 'lower-body increment per rep over the standard' },
    { lb: 2.5, kg: 1.25, note: 'upper-body increment per rep, and the fine lower-body increment' },
    { lb: 1.25, kg: 0, note: 'fine upper-body increment, so fine is offered for lb enrollments only' },
  ],
  weekTables: { waves: WAVES.flatMap(waveRows) },
  schedule: { kind: 'cycle', weeksPerCycle: 16, waveWeeks: 4, days: JUGGERNAUT_LIFTS.map(mainDay) },
  progression: JUGGERNAUT_LIFTS.map(waveRule),
};

export const JUGGERNAUT_DEFAULT_TMS_KG: Readonly<Record<JuggernautLift, number>> = {
  squat: 180,
  bench: 100,
  deadlift: 200,
  press: 60,
};

export interface JuggernautEnrollmentOverrides {
  unit?: WeightUnit;
  tms?: Partial<Record<JuggernautLift, number>>;
  options?: Readonly<Record<string, OptionValue>>;
}

export function juggernautEnrollment(overrides: JuggernautEnrollmentOverrides = {}): ProgramEnrollment {
  const unit = overrides.unit ?? 'kg';
  const tms = { ...JUGGERNAUT_DEFAULT_TMS_KG, ...overrides.tms };
  return {
    id: 'enrollment-juggernaut',
    unit,
    options: { perRep: 'standard', ...overrides.options },
    bindings: Object.fromEntries(JUGGERNAUT_LIFTS.map((lift) => [lift, lift])),
    inputs: Object.fromEntries(JUGGERNAUT_LIFTS.map((lift) => [lift, { tm: tms[lift] }])),
    rounding: DEFAULT_ROUNDING[unit],
  };
}

export function juggernautDay(week: number, lift: JuggernautLift, cycle = 1): CyclePosition {
  return { cycle, week, day: lift };
}
