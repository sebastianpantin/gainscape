import { randomUUID } from 'node:crypto';
import { postCompleteSession } from '../../tests/integration/local-stack.ts';
import { exerciseIdOfKey, skipProgramDayElsewhere } from './db.ts';

export type FiveThreeOneLift = 'squat' | 'bench' | 'deadlift' | 'press';
type ProgramPosition = Readonly<Record<string, string | number>>;
export type LiftBindings = Readonly<Record<string, string | null>>;
export type SeededEffort =
  { type: 'rpe'; value: number } | { type: 'rir'; value: number } | { type: 'level'; level: 'hard' };

export interface SeededSet {
  lift: string;
  ref: string;
  weightKg: number;
  reps: number;
  loggedWeightKg?: number;
  loggedReps?: number;
  effort?: SeededEffort;
  amrap?: boolean;
  minReps?: number | null;
}

export interface SeededDay {
  position: ProgramPosition;
  sets: readonly SeededSet[];
}

export interface SessionClock {
  next(): Date;
}

const SESSION_MINUTES = 30;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const PLATE_INCREMENT_KG = 2.5;
const BAR_KG = 20;
const TIE_TOLERANCE = 1e-9;
const DEFAULT_EFFORT: SeededEffort = { type: 'level', level: 'hard' };

export function sessionClock(hoursBack: number): SessionClock {
  const firstStart = Date.now() - hoursBack * HOUR_MS;
  let started = 0;
  return {
    next() {
      const startedAt = new Date(firstStart + started * HOUR_MS);
      started += 1;
      return startedAt;
    },
  };
}

export function fiveRepSets(
  slot: string,
  lift: string,
  weightKg: number,
  count: number,
  lastSetReps?: number,
): SeededSet[] {
  return Array.from({ length: count }, (_, index) => {
    const set = { lift, ref: `${slot}:${index}`, weightKg, reps: 5 };
    return index === count - 1 && lastSetReps !== undefined ? { ...set, loggedReps: lastSetReps } : set;
  });
}

export function nearestPlateKg(rawKg: number): number {
  return Math.max(BAR_KG, Math.round(rawKg / PLATE_INCREMENT_KG + TIE_TOLERANCE) * PLATE_INCREMENT_KG);
}

function exerciseOf(bindings: LiftBindings, lift: string): string {
  const exerciseId = bindings[lift];
  if (!exerciseId) throw new Error(`no exercise is bound to ${lift}`);
  return exerciseId;
}

function payloadSets(bindings: LiftBindings, sets: readonly SeededSet[]) {
  return sets.map((set, index) => ({
    id: randomUUID(),
    exerciseId: exerciseOf(bindings, set.lift),
    position: index,
    weightKg: set.loggedWeightKg ?? set.weightKg,
    reps: set.loggedReps ?? set.reps,
    isWarmup: false,
    effort: set.effort ?? DEFAULT_EFFORT,
    prescription: {
      ref: set.ref,
      weightKg: set.weightKg,
      reps: set.reps,
      minReps: set.minReps ?? null,
      amrap: set.amrap ?? false,
    },
  }));
}

async function postProgramDay(
  accessToken: string,
  enrollmentId: string,
  bindings: LiftBindings,
  day: SeededDay,
  startedAt: Date,
): Promise<void> {
  const response = await postCompleteSession(accessToken, {
    id: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + SESSION_MINUTES * MINUTE_MS).toISOString(),
    notes: null,
    program: { enrollmentId, position: day.position },
    sets: payloadSets(bindings, day.sets),
  });
  if (response.status !== 200 || response.body.programLinked !== true)
    throw new Error(`seeding ${JSON.stringify(day.position)} failed: ${response.status} ${response.rawBody}`);
}

export async function seedProgramDays(
  accessToken: string,
  enrollmentId: string,
  bindings: LiftBindings,
  clock: SessionClock,
  days: readonly SeededDay[],
): Promise<void> {
  for (const day of days) await postProgramDay(accessToken, enrollmentId, bindings, day, clock.next());
}

const FIVE_THREE_ONE_EXERCISE_KEYS: Readonly<Record<FiveThreeOneLift, string>> = {
  squat: 'back_squat',
  bench: 'barbell_bench_press',
  deadlift: 'deadlift',
  press: 'overhead_press',
};

const MAIN_REPS_BY_WEEK: readonly (readonly number[])[] = [
  [5, 5, 5],
  [3, 3, 3],
  [5, 3, 1],
  [5, 5, 5],
];

const AMRAP_WEEKS: readonly number[] = [1, 2, 3];
const SUMMARY_SEED_WEIGHT_KG = 60;

async function fiveThreeOneBindings(): Promise<LiftBindings> {
  const entries = await Promise.all(
    Object.entries(FIVE_THREE_ONE_EXERCISE_KEYS).map(async ([lift, key]) => [lift, await exerciseIdOfKey(key)]),
  );
  return Object.fromEntries(entries);
}

function fixedWeightMainSets(lift: FiveThreeOneLift, week: number): SeededSet[] {
  const reps = MAIN_REPS_BY_WEEK[week - 1];
  return reps.map((setReps, index) => {
    const amrap = index === reps.length - 1 && AMRAP_WEEKS.includes(week);
    return {
      lift,
      ref: `${lift}-main:${index}`,
      weightKg: SUMMARY_SEED_WEIGHT_KG,
      reps: setReps,
      minReps: amrap ? setReps : null,
      amrap,
    };
  });
}

interface SeededSession {
  enrollmentId: string;
  week: number;
  lift: FiveThreeOneLift;
  startedAt: Date;
}

export async function postFiveThreeOneSession(accessToken: string, session: SeededSession): Promise<void> {
  const day = {
    position: { cycle: 1, week: session.week, day: session.lift },
    sets: fixedWeightMainSets(session.lift, session.week),
  };
  await postProgramDay(accessToken, session.enrollmentId, await fiveThreeOneBindings(), day, session.startedAt);
}

export async function seedFiveThreeOneCycleSkippingPress(accessToken: string, enrollmentId: string): Promise<void> {
  const lifts: readonly FiveThreeOneLift[] = ['squat', 'bench', 'deadlift'];
  const bindings = await fiveThreeOneBindings();
  const clock = sessionClock(4 * lifts.length + 1);
  for (const week of [1, 2, 3, 4]) {
    const days = lifts.map((lift) => ({
      position: { cycle: 1, week, day: lift },
      sets: fixedWeightMainSets(lift, week),
    }));
    await seedProgramDays(accessToken, enrollmentId, bindings, clock, days);
    await skipProgramDayElsewhere(enrollmentId, { cycle: 1, week, day: 'press' });
  }
}

type MadcowLift = 'squat' | 'bench' | 'row' | 'press' | 'deadlift';
type MadcowMondayLift = 'squat' | 'bench' | 'row';

export interface MadcowWeekScript {
  mondayTopReps?: Partial<Record<MadcowMondayLift, number>>;
}

const MADCOW_RAMP_STEP = 0.125;
const MADCOW_ON_RAMP_FACTOR = 0.975;
const MADCOW_PEAK_WEEK = 4;
const MADCOW_FRIDAY_TRIPLE_PCT = 1.025;
const MADCOW_MONDAY_LIFTS: readonly MadcowMondayLift[] = ['squat', 'bench', 'row'];

function madcowOnRampTopKg(fiveRmKg: number, week: number): number {
  return fiveRmKg * MADCOW_ON_RAMP_FACTOR ** (MADCOW_PEAK_WEEK - week);
}

function withLoggedReps(set: SeededSet, loggedReps: number | undefined): SeededSet {
  return loggedReps === undefined ? set : { ...set, loggedReps };
}

function madcowRamp(slot: string, lift: MadcowLift, topKg: number, count: number, topReps?: number): SeededSet[] {
  const roundedTopKg = nearestPlateKg(topKg);
  return Array.from({ length: count }, (_, index) => {
    const pct = 1 - MADCOW_RAMP_STEP * (count - 1 - index);
    const set = { lift, ref: `${slot}:${index}`, weightKg: nearestPlateKg(roundedTopKg * pct), reps: 5 };
    return withLoggedReps(set, index === count - 1 ? topReps : undefined);
  });
}

function sameAsMonday(monday: readonly SeededSet[], slot: string, mondayIndexes: readonly number[], reps: number[]) {
  return mondayIndexes.map((mondayIndex, index) => ({
    lift: monday[mondayIndex].lift,
    ref: `${slot}:${index}`,
    weightKg: monday[mondayIndex].weightKg,
    reps: reps[index],
  }));
}

function madcowFriday(lift: MadcowMondayLift, monday: readonly SeededSet[], topKg: number): SeededSet[] {
  const [first, second, third, fourth, back] = sameAsMonday(monday, `fri-${lift}`, [0, 1, 2, 3, 2], [5, 5, 5, 5, 8]);
  const triple = { lift, ref: `fri-${lift}:4`, weightKg: nearestPlateKg(topKg * MADCOW_FRIDAY_TRIPLE_PCT), reps: 3 };
  return [first, second, third, fourth, triple, { ...back, ref: `fri-${lift}:5` }];
}

export function madcowOnRampWeek(
  fiveRmsKg: Readonly<Record<MadcowLift, number>>,
  week: number,
  script: MadcowWeekScript = {},
): SeededDay[] {
  const topKg = (lift: MadcowLift) => madcowOnRampTopKg(fiveRmsKg[lift], week);
  const monday = (lift: MadcowMondayLift) =>
    madcowRamp(`mon-${lift}`, lift, topKg(lift), 5, script.mondayTopReps?.[lift]);
  const mondayByLift: Record<MadcowMondayLift, SeededSet[]> = {
    squat: monday('squat'),
    bench: monday('bench'),
    row: monday('row'),
  };
  const wednesday = [
    ...sameAsMonday(mondayByLift.squat, 'wed-squat', [0, 1, 2, 2], [5, 5, 5, 5]),
    ...madcowRamp('wed-press', 'press', topKg('press'), 4),
    ...madcowRamp('wed-deadlift', 'deadlift', topKg('deadlift'), 4),
  ];
  return [
    { position: { week, day: 'mon' }, sets: MADCOW_MONDAY_LIFTS.flatMap((lift) => mondayByLift[lift]) },
    { position: { week, day: 'wed' }, sets: wednesday },
    {
      position: { week, day: 'fri' },
      sets: MADCOW_MONDAY_LIFTS.flatMap((lift) => madcowFriday(lift, mondayByLift[lift], topKg(lift))),
    },
  ];
}

export interface FiveThreeOneCycleScript {
  amrapReps?: Partial<Record<FiveThreeOneLift, Partial<Record<number, number>>>>;
}

const FIVE_THREE_ONE_DAY_ORDER: readonly FiveThreeOneLift[] = ['squat', 'bench', 'deadlift', 'press'];
const MAIN_PCTS_BY_WEEK: readonly (readonly number[])[] = [
  [0.65, 0.75, 0.85],
  [0.7, 0.8, 0.9],
  [0.75, 0.85, 0.95],
  [0.4, 0.5, 0.6],
];
const BBB_PCT = 0.5;
const BBB_SETS = 5;
const BBB_REPS = 10;
const BBB_WEEKS: readonly number[] = [1, 2, 3];

function prescribedMainSets(
  lift: FiveThreeOneLift,
  tmKg: number,
  week: number,
  amrapReps: number | undefined,
): SeededSet[] {
  const reps = MAIN_REPS_BY_WEEK[week - 1];
  return MAIN_PCTS_BY_WEEK[week - 1].map((pct, index) => {
    const amrap = index === reps.length - 1 && AMRAP_WEEKS.includes(week);
    const set = {
      lift,
      ref: `${lift}-main:${index}`,
      weightKg: nearestPlateKg(tmKg * pct),
      reps: reps[index],
      minReps: amrap ? reps[index] : null,
      amrap,
    };
    return withLoggedReps(set, amrap ? amrapReps : undefined);
  });
}

function bbbSets(lift: FiveThreeOneLift, tmKg: number, week: number): SeededSet[] {
  if (!BBB_WEEKS.includes(week)) return [];
  return Array.from({ length: BBB_SETS }, (_, index) => ({
    lift,
    ref: `${lift}-bbb:${index}`,
    weightKg: nearestPlateKg(tmKg * BBB_PCT),
    reps: BBB_REPS,
  }));
}

export function fiveThreeOneBbbCycle(
  tmsKg: Readonly<Record<FiveThreeOneLift, number>>,
  cycle: number,
  script: FiveThreeOneCycleScript = {},
): SeededDay[] {
  return [1, 2, 3, 4].flatMap((week) =>
    FIVE_THREE_ONE_DAY_ORDER.map((lift) => ({
      position: { cycle, week, day: lift },
      sets: [
        ...prescribedMainSets(lift, tmsKg[lift], week, script.amrapReps?.[lift]?.[week]),
        ...bbbSets(lift, tmsKg[lift], week),
      ],
    })),
  );
}
