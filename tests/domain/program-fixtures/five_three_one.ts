import {
  type CyclePosition,
  DEFAULT_ROUNDING,
  type FactSet,
  type LiftDecl,
  type OptionValue,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgressionRule,
  type RoundingSetting,
  type SlotDecl,
  type WeekTableRow,
  type WeightUnit,
} from '@domain/index.ts';
import { type FactClock, sessionFact, setAsPrescribed } from './facts.ts';

const WENDLER_BBB = 'https://www.jimwendler.com/blogs/jimwendler-com/101077382-boring-but-big';
const ARVO_531 = 'https://arvo.guru/resources/methods/wendler-531';
const LIFTVAULT_BBB = 'https://liftvault.com/programs/strength/531-bbb/';
const SIMPLIFASTER_FSL_5X5 = 'https://simplifaster.com/?p=14835';
const LIFTVAULT_TM_DEFINITION = 'https://liftvault.com/resources/531-training-max-definition-examples/';

export const FIVE_THREE_ONE_LIFTS = ['squat', 'bench', 'deadlift', 'press'] as const;
export type FiveThreeOneLift = (typeof FIVE_THREE_ONE_LIFTS)[number];

export const FIVE_THREE_ONE_EXERCISES: Readonly<Record<FiveThreeOneLift, string>> = {
  squat: 'squat',
  bench: 'bench',
  deadlift: 'deadlift',
  press: 'ohp',
};

const LIFT_DECLS: LiftDecl[] = [
  { key: 'squat', name: 'Squat', category: 'lower' },
  { key: 'bench', name: 'Bench press', category: 'upper' },
  { key: 'deadlift', name: 'Deadlift', category: 'lower' },
  { key: 'press', name: 'Overhead press', category: 'upper' },
];

const MAIN_TABLE: WeekTableRow[] = [
  {
    sets: [
      { pct: 0.65, reps: 5 },
      { pct: 0.75, reps: 5 },
      { pct: 0.85, reps: 5, amrap: true, minReps: 5 },
    ],
  },
  {
    sets: [
      { pct: 0.7, reps: 3 },
      { pct: 0.8, reps: 3 },
      { pct: 0.9, reps: 3, amrap: true, minReps: 3 },
    ],
  },
  {
    sets: [
      { pct: 0.75, reps: 5 },
      { pct: 0.85, reps: 3 },
      { pct: 0.95, reps: 1, amrap: true, minReps: 1 },
    ],
  },
  {
    sets: [
      { pct: 0.4, reps: 5 },
      { pct: 0.5, reps: 5 },
      { pct: 0.6, reps: 5 },
    ],
  },
];

const NON_DELOAD_WEEKS = [1, 2, 3];

function daySlots(lift: FiveThreeOneLift): SlotDecl[] {
  return [
    { id: `${lift}-main`, lift, role: 'main', scheme: { kind: 'weekTable', table: 'main', of: 'tm' } },
    {
      id: `${lift}-bbb`,
      lift,
      role: 'supplemental',
      weeks: NON_DELOAD_WEEKS,
      when: [
        { option: 'supplemental', equals: 'bbb' },
        { option: 'bbbProgression', equals: 'standard' },
      ],
      scheme: { kind: 'repeat', count: 5, reps: 10, load: { kind: 'pct', pct: { option: 'bbbPct' }, of: 'tm' } },
    },
    {
      id: `${lift}-bbb-beginner`,
      lift,
      role: 'supplemental',
      weeks: NON_DELOAD_WEEKS,
      when: [
        { option: 'supplemental', equals: 'bbb' },
        { option: 'bbbProgression', equals: 'beginner' },
      ],
      scheme: {
        kind: 'repeat',
        count: 5,
        reps: 10,
        load: { kind: 'pct', pct: { byCycle: [0.3, 0.45, 0.6] }, of: 'tm' },
      },
    },
    {
      id: `${lift}-fsl`,
      lift,
      role: 'supplemental',
      weeks: NON_DELOAD_WEEKS,
      when: [{ option: 'supplemental', equals: 'fsl' }],
      scheme: {
        kind: 'repeat',
        count: 5,
        reps: 5,
        load: { kind: 'weekTablePct', table: 'main', set: 0, of: 'tm' },
      },
    },
  ];
}

const UPPER_INCREMENT = { kg: 2.5, lb: 5 };
const LOWER_INCREMENT = { kg: 5, lb: 10 };

function cycleRule(lift: LiftDecl): ProgressionRule {
  return {
    lift: lift.key,
    var: 'tm',
    trigger: 'endOfCycle',
    judgedSlots: [`${lift.key}-main`],
    judgedWeeks: NON_DELOAD_WEEKS,
    onMet: [{ kind: 'increment', by: lift.category === 'lower' ? LOWER_INCREMENT : UPPER_INCREMENT }],
    onMiss: [{ kind: 'tmReset', pct: { option: 'tmReset' } }],
  };
}

export const FIVE_THREE_ONE: ProgramDefinition = {
  key: 'five_three_one',
  version: 1,
  name: '5/3/1',
  source: [ARVO_531, LIFTVAULT_BBB, WENDLER_BBB],
  lifts: LIFT_DECLS,
  inputs: [{ lifts: [...FIVE_THREE_ONE_LIFTS], kinds: ['oneRm', 'tm'] }],
  referenceVars: ['tm'],
  initial: [
    { kind: 'copy', var: 'tm', from: 'tm' },
    { kind: 'scale', var: 'tm', from: 'oneRm', factor: { option: 'tmPct' } },
  ],
  options: [
    {
      key: 'supplemental',
      kind: 'choice',
      values: ['none', 'bbb', 'fsl'],
      default: 'bbb',
      source: [WENDLER_BBB, ARVO_531, SIMPLIFASTER_FSL_5X5],
    },
    { key: 'bbbPct', kind: 'choice', values: [0.5, 0.55, 0.6], default: 0.5, source: [WENDLER_BBB] },
    {
      key: 'bbbProgression',
      kind: 'choice',
      values: ['standard', 'beginner'],
      default: 'standard',
      source: [WENDLER_BBB],
    },
    { key: 'tmPct', kind: 'choice', values: [0.9, 0.85], default: 0.9, source: [LIFTVAULT_TM_DEFINITION] },
    { key: 'tmReset', kind: 'number', min: 0.1, max: 0.15, default: 0.1, source: [ARVO_531, LIFTVAULT_BBB] },
  ],
  conversions: [
    { lb: 5, kg: 2.5, note: 'upper-body cycle increment' },
    { lb: 10, kg: 5, note: 'lower-body cycle increment' },
  ],
  weekTables: { main: MAIN_TABLE },
  schedule: {
    kind: 'cycle',
    weeksPerCycle: 4,
    days: LIFT_DECLS.map((lift) => ({
      key: lift.key,
      name: lift.name,
      slots: daySlots(lift.key as FiveThreeOneLift),
    })),
  },
  progression: LIFT_DECLS.map(cycleRule),
};

export const FIVE_THREE_ONE_DEFAULT_TMS_KG: Readonly<Record<FiveThreeOneLift, number>> = {
  squat: 140,
  bench: 100,
  deadlift: 180,
  press: 60,
};

export interface FiveThreeOneEnrollmentOverrides {
  unit?: WeightUnit;
  options?: Readonly<Record<string, OptionValue>>;
  tms?: Partial<Record<FiveThreeOneLift, number>>;
  oneRms?: Partial<Record<FiveThreeOneLift, number>>;
  rounding?: RoundingSetting;
}

export function fiveThreeOneEnrollment(overrides: FiveThreeOneEnrollmentOverrides = {}): ProgramEnrollment {
  const unit = overrides.unit ?? 'kg';
  const usesOneRms = overrides.oneRms !== undefined;
  const tms = { ...FIVE_THREE_ONE_DEFAULT_TMS_KG, ...overrides.tms };
  return {
    id: 'enrollment-531',
    unit,
    options: {
      supplemental: 'bbb',
      bbbPct: 0.5,
      bbbProgression: 'standard',
      tmPct: 0.9,
      tmReset: 0.1,
      ...overrides.options,
    },
    bindings: { ...FIVE_THREE_ONE_EXERCISES },
    inputs: Object.fromEntries(
      FIVE_THREE_ONE_LIFTS.map((lift) => [
        lift,
        usesOneRms ? { oneRm: overrides.oneRms?.[lift] ?? tms[lift] / 0.9 } : { tm: tms[lift] },
      ]),
    ),
    rounding: overrides.rounding ?? DEFAULT_ROUNDING[unit],
  };
}

export function cyclePosition(cycle: number, week: number, day: FiveThreeOneLift): CyclePosition {
  return { cycle, week, day };
}

const MAIN_REPS_BY_WEEK: readonly (readonly number[])[] = [
  [5, 5, 5],
  [3, 3, 3],
  [5, 3, 1],
  [5, 5, 5],
];
const AMRAP_WEEKS = new Set([1, 2, 3]);
const SNAPSHOT_WEIGHT_KG = 100;

export function mainSets531(lift: FiveThreeOneLift, week: number, lastSetReps?: number): FactSet[] {
  const reps = MAIN_REPS_BY_WEEK[week - 1];
  return reps.map((prescribedReps, index) => {
    const isLast = index === reps.length - 1;
    const amrap = isLast && AMRAP_WEEKS.has(week);
    return setAsPrescribed(
      FIVE_THREE_ONE_EXERCISES[lift],
      `${lift}-main:${index}`,
      { weightKg: SNAPSHOT_WEIGHT_KG, reps: prescribedReps, amrap, minReps: amrap ? prescribedReps : null },
      isLast && lastSetReps !== undefined ? lastSetReps : undefined,
    );
  });
}

export function bbbSets531(lift: FiveThreeOneLift, reps: number): FactSet[] {
  return [0, 1, 2, 3, 4].map((index) =>
    setAsPrescribed(
      FIVE_THREE_ONE_EXERCISES[lift],
      `${lift}-bbb:${index}`,
      { weightKg: 50, reps: 10 },
      index === 4 ? reps : undefined,
    ),
  );
}

export interface CycleScript {
  lifts?: readonly FiveThreeOneLift[];
  weeks?: readonly number[];
  lastSetReps?: Partial<Record<string, number>>;
}

export function cycleSessions(clock: FactClock, cycle: number, script: CycleScript = {}): ProgramFact[] {
  const lifts = script.lifts ?? FIVE_THREE_ONE_LIFTS;
  const weeks = script.weeks ?? [1, 2, 3, 4];
  return weeks.flatMap((week) =>
    lifts.map((lift) =>
      sessionFact(
        clock.next(),
        cyclePosition(cycle, week, lift),
        mainSets531(lift, week, script.lastSetReps?.[`${lift}@${week}`]),
      ),
    ),
  );
}
