import { expect, type Locator, type Page, test } from '@playwright/test';
import { readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import { dayPicker, followProgram, openProgramToday, prescribedRows } from './support/program-enrollment.ts';
import {
  type LiftBindings,
  nearestPlateKg,
  type SeededDay,
  type SeededSet,
  seedProgramDays,
  sessionClock,
} from './support/program-seed.ts';

const NSUNS = 'nSuns LP 5-day';
const DAYS_PER_WEEK = 5;

type NsunsLift = 'bench' | 'squat' | 'press' | 'deadlift';
type SchemeRow = readonly [reps: number, pct: number, amrap?: 'amrap'];
type AmrapSlot = 'mon-bench' | 'tue-squat' | 'wed-press' | 'thu-deadlift' | 'fri-bench';
type LoggedAmrapReps = Readonly<Record<number, number>>;
type AmrapReps = Readonly<Partial<Record<AmrapSlot, LoggedAmrapReps>>>;

const WEEK_ONE_TMS_KG: Readonly<Record<NsunsLift, number>> = { bench: 100, squat: 140, press: 60, deadlift: 200 };

const MONDAY_BENCH: readonly SchemeRow[] = [
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
const ONE_PLUS_MAIN: readonly SchemeRow[] = [
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
const ONE_PLUS_DEADLIFT: readonly SchemeRow[] = [
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

function supplemental(reps: readonly number[], pcts: readonly [number, number, number]): SchemeRow[] {
  const [first, second, rest] = pcts;
  return reps.map((setReps, index) => [setReps, index === 0 ? first : index === 1 ? second : rest]);
}

const PRESS_SUPPLEMENTAL = supplemental([6, 5, 3, 5, 7, 4, 6, 8], [0.5, 0.6, 0.7]);
const SUMO_SUPPLEMENTAL = supplemental([5, 5, 3, 5, 7, 4, 6, 8], [0.5, 0.6, 0.7]);
const BENCH_SUPPLEMENTAL = supplemental([6, 5, 3, 5, 7, 4, 6, 8], [0.4, 0.5, 0.6]);
const FRONT_SQUAT_SUPPLEMENTAL = supplemental([5, 5, 3, 5, 7, 4, 6, 8], [0.35, 0.45, 0.55]);

function slotSets(
  slot: string,
  lift: string,
  tmKg: number,
  rows: readonly SchemeRow[],
  loggedAmrapReps: LoggedAmrapReps = {},
): SeededSet[] {
  return rows.map(([reps, pct, amrap], index) => {
    const set = { lift, ref: `${slot}:${index}`, weightKg: nearestPlateKg(tmKg * pct), reps };
    if (amrap === undefined) return set;
    const loggedReps = loggedAmrapReps[index];
    return { ...set, amrap: true, minReps: reps, ...(loggedReps === undefined ? {} : { loggedReps }) };
  });
}

function nsunsWeek(tms: Readonly<Record<NsunsLift, number>>, week: number, amrapReps: AmrapReps): SeededDay[] {
  return [
    {
      position: { week, day: 'mon' },
      sets: [
        ...slotSets('mon-bench', 'bench', tms.bench, MONDAY_BENCH, amrapReps['mon-bench']),
        ...slotSets('mon-press', 'press', tms.press, PRESS_SUPPLEMENTAL),
      ],
    },
    {
      position: { week, day: 'tue' },
      sets: [
        ...slotSets('tue-squat', 'squat', tms.squat, ONE_PLUS_MAIN, amrapReps['tue-squat']),
        ...slotSets('tue-sumo-deadlift', 'sumo-deadlift', tms.deadlift, SUMO_SUPPLEMENTAL),
      ],
    },
    {
      position: { week, day: 'wed' },
      sets: [
        ...slotSets('wed-press', 'press', tms.press, ONE_PLUS_MAIN, amrapReps['wed-press']),
        ...slotSets('wed-incline-bench', 'incline-bench', tms.bench, BENCH_SUPPLEMENTAL),
      ],
    },
    {
      position: { week, day: 'thu' },
      sets: [
        ...slotSets('thu-deadlift', 'deadlift', tms.deadlift, ONE_PLUS_DEADLIFT, amrapReps['thu-deadlift']),
        ...slotSets('thu-front-squat', 'front-squat', tms.squat, FRONT_SQUAT_SUPPLEMENTAL),
      ],
    },
    {
      position: { week, day: 'fri' },
      sets: [
        ...slotSets('fri-bench', 'bench', tms.bench, ONE_PLUS_MAIN, amrapReps['fri-bench']),
        ...slotSets('fri-close-grip-bench', 'close-grip-bench', tms.bench, BENCH_SUPPLEMENTAL),
      ],
    },
  ];
}

const SUPPLEMENTAL_LIFTS_WITHOUT_DEFAULT_BINDING: readonly string[] = [
  'sumo-deadlift',
  'incline-bench',
  'front-squat',
  'close-grip-bench',
];

function withoutUnboundSupplementals(bindings: LiftBindings, days: readonly SeededDay[]): SeededDay[] {
  const isSkipped = (lift: string) => SUPPLEMENTAL_LIFTS_WITHOUT_DEFAULT_BINDING.includes(lift) && !bindings[lift];
  return days.map((day) => ({ ...day, sets: day.sets.filter((set) => !isSkipped(set.lift)) }));
}

async function seedWeekOne(page: Page, prefix: string, amrapReps: AmrapReps): Promise<void> {
  const username = uniqueUsername(prefix);
  await register(page, username);
  await followProgram(page, NSUNS, {
    'Bench press training max (kg)': WEEK_ONE_TMS_KG.bench,
    'Squat training max (kg)': WEEK_ONE_TMS_KG.squat,
    'Overhead press training max (kg)': WEEK_ONE_TMS_KG.press,
    'Deadlift training max (kg)': WEEK_ONE_TMS_KG.deadlift,
  });
  const { access_token: accessToken } = await readSession(page);
  const enrollmentId = await activeEnrollmentIdOf(username);
  const { lift_bindings: bindings } = await activeEnrollmentOf(username);
  const days = withoutUnboundSupplementals(bindings, nsunsWeek(WEEK_ONE_TMS_KG, 1, amrapReps));
  await seedProgramDays(accessToken, enrollmentId, bindings, sessionClock(DAYS_PER_WEEK + 1), days);
}

async function openWeekTwoDay(today: Locator, day: string): Promise<void> {
  await dayPicker(today)
    .getByRole('radio', { name: `W2 ${day}`, exact: true })
    .click();
  await expect(today.getByRole('button', { name: `Start: ${NSUNS} — W2 ${day}`, exact: true })).toBeVisible();
}

test('nSuns raises each TM at the end of week 1 by the 1+ set reps: squat 2 reps → 140 + 2.5 = 142.5, press 4 reps → 60 + 5 = 65, deadlift 6 reps → 200 + 6.25 = 206.25, bench (Friday) 3 reps → 100 + 2.5 = 102.5; W2 1+ sets 142.5 × 0.95 = 135.375 → 135, 65 × 0.95 = 61.75 → 62.5, 206.25 × 0.95 = 195.94 → 195, 102.5 × 0.95 = 97.375 → 97.5', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seedWeekOne(page, 'pf_ns', {
    'tue-squat': { 2: 2 },
    'wed-press': { 2: 4 },
    'thu-deadlift': { 2: 6 },
    'fri-bench': { 2: 3 },
  });

  const today = await openProgramToday(page, NSUNS);
  await expect(dayPicker(today).getByRole('radio', { name: 'W2 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText([
    '67.5 kg × 8 · 65%',
    '77.5 kg × 6 · 75%',
    '87.5 kg × 4 · 85%',
    '87.5 kg × 4 · 85%',
    '87.5 kg × 4 · 85%',
    '82.5 kg × 5 · 80%',
    '77.5 kg × 6 · 75%',
    '72.5 kg × 7 · 70%',
    '67.5 kg × 8+ · 65%',
  ]);
  await expect(prescribedRows(today, 'Overhead Press — supplemental')).toHaveText([
    '32.5 kg × 6 · 50%',
    '40 kg × 5 · 60%',
    '45 kg × 3 · 70%',
    '45 kg × 5 · 70%',
    '45 kg × 7 · 70%',
    '45 kg × 4 · 70%',
    '45 kg × 6 · 70%',
    '45 kg × 8 · 70%',
  ]);

  await openWeekTwoDay(today, 'Day 2');
  await expect(prescribedRows(today, 'Back Squat')).toHaveText([
    '107.5 kg × 5 · 75%',
    '120 kg × 3 · 85%',
    '135 kg × 1+ · 95%',
    '127.5 kg × 3 · 90%',
    '120 kg × 3 · 85%',
    '115 kg × 3 · 80%',
    '107.5 kg × 5 · 75%',
    '100 kg × 5 · 70%',
    '92.5 kg × 5+ · 65%',
  ]);

  await openWeekTwoDay(today, 'Day 3');
  await expect(prescribedRows(today, 'Overhead Press')).toHaveText([
    '50 kg × 5 · 75%',
    '55 kg × 3 · 85%',
    '62.5 kg × 1+ · 95%',
    '57.5 kg × 3 · 90%',
    '55 kg × 3 · 85%',
    '52.5 kg × 3 · 80%',
    '50 kg × 5 · 75%',
    '45 kg × 5 · 70%',
    '42.5 kg × 5+ · 65%',
  ]);

  await openWeekTwoDay(today, 'Day 4');
  await expect(prescribedRows(today, 'Deadlift')).toHaveText([
    '155 kg × 5 · 75%',
    '175 kg × 3 · 85%',
    '195 kg × 1+ · 95%',
    '185 kg × 3 · 90%',
    '175 kg × 3 · 85%',
    '165 kg × 3 · 80%',
    '155 kg × 3 · 75%',
    '145 kg × 3 · 70%',
    '135 kg × 3+ · 65%',
  ]);

  await openWeekTwoDay(today, 'Day 5');
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText([
    '77.5 kg × 5 · 75%',
    '87.5 kg × 3 · 85%',
    '97.5 kg × 1+ · 95%',
    '92.5 kg × 3 · 90%',
    '87.5 kg × 3 · 85%',
    '82.5 kg × 3 · 80%',
    '77.5 kg × 5 · 75%',
    '72.5 kg × 5 · 70%',
    '67.5 kg × 5+ · 65%',
  ]);
});

test('nSuns keeps a TM when its 1+ set gets a single rep, whatever the other AMRAP sets show: a 15-rep Monday bench 8+ with a 1-rep Friday 1+ keeps bench at 100 (W2 Day 1 65/75/85 … 65 kg × 8+), and a 12-rep squat 5+ with a 1-rep 1+ keeps squat at 140 (1+ 140 × 0.95 = 133 → 132.5)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seedWeekOne(page, 'pf_nsk', {
    'mon-bench': { 8: 15 },
    'tue-squat': { 2: 1, 8: 12 },
    'fri-bench': { 2: 1 },
  });

  const today = await openProgramToday(page, NSUNS);
  await expect(dayPicker(today).getByRole('radio', { name: 'W2 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText([
    '65 kg × 8 · 65%',
    '75 kg × 6 · 75%',
    '85 kg × 4 · 85%',
    '85 kg × 4 · 85%',
    '85 kg × 4 · 85%',
    '80 kg × 5 · 80%',
    '75 kg × 6 · 75%',
    '70 kg × 7 · 70%',
    '65 kg × 8+ · 65%',
  ]);

  await openWeekTwoDay(today, 'Day 2');
  await expect(prescribedRows(today, 'Back Squat')).toHaveText([
    '105 kg × 5 · 75%',
    '120 kg × 3 · 85%',
    '132.5 kg × 1+ · 95%',
    '125 kg × 3 · 90%',
    '120 kg × 3 · 85%',
    '112.5 kg × 3 · 80%',
    '105 kg × 5 · 75%',
    '97.5 kg × 5 · 70%',
    '90 kg × 5+ · 65%',
  ]);
});
