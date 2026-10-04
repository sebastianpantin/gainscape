import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { postCompleteSession } from '../tests/integration/local-stack.ts';
import { openTab, readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import { dayPicker, followProgram, prescribedRows, programToday, repeated } from './support/program-enrollment.ts';
import { type LiftBindings, sessionClock } from './support/program-seed.ts';

const RPE = 'RPE top set with back-offs';
const SESSION_MS = 30 * 60 * 1000;
const BACK_OFF_SETS = 5;
const BACK_OFF_PCT = 0.95;
const PLATE_INCREMENT_KG = 2.5;
const BAR_KG = 20;
const TIE_TOLERANCE = 1e-9;

type RpeLift = 'squat' | 'bench' | 'deadlift';
type LoggedEffort = { type: 'rpe'; value: number } | { type: 'rir'; value: number } | { type: 'level'; level: 'hard' };

interface LoggedTopSet {
  lift: RpeLift;
  prescribedKg: number;
  loggedKg: number;
  reps: number;
  effort: LoggedEffort;
}

interface WeekTwoDay {
  day: string;
  exercise: string;
  topRow: string;
  backOffRow: string;
}

function nearestPlateKg(rawKg: number): number {
  return Math.max(BAR_KG, Math.round(rawKg / PLATE_INCREMENT_KG + TIE_TOLERANCE) * PLATE_INCREMENT_KG);
}

function loggedSet(bindings: LiftBindings, lift: RpeLift, position: number, effort: LoggedEffort) {
  const exerciseId = bindings[lift];
  if (!exerciseId) throw new Error(`no exercise is bound to ${lift}`);
  return { id: randomUUID(), exerciseId, position, isWarmup: false, effort };
}

function rpeDaySets(bindings: LiftBindings, top: LoggedTopSet) {
  const backOffKg = nearestPlateKg(top.prescribedKg * BACK_OFF_PCT);
  const topSet = {
    ...loggedSet(bindings, top.lift, 0, top.effort),
    weightKg: top.loggedKg,
    reps: top.reps,
    prescription: { ref: `${top.lift}-top:0`, weightKg: top.prescribedKg, reps: 3, minReps: null, amrap: false },
  };
  const backOffs = Array.from({ length: BACK_OFF_SETS }, (_, index) => ({
    ...loggedSet(bindings, top.lift, index + 1, top.effort),
    weightKg: backOffKg,
    reps: 3,
    prescription: { ref: `${top.lift}-fatigue:${index}`, weightKg: backOffKg, reps: 3, minReps: null, amrap: false },
  }));
  return [topSet, ...backOffs];
}

async function seedWeekOne(page: Page, prefix: string, topSets: readonly LoggedTopSet[]): Promise<void> {
  const username = uniqueUsername(prefix);
  await register(page, username);
  await followProgram(page, RPE, {
    'Squat estimated 1RM (kg)': 200,
    'Bench press estimated 1RM (kg)': 120,
    'Deadlift estimated 1RM (kg)': 240,
  });
  const { access_token: accessToken } = await readSession(page);
  const enrollmentId = await activeEnrollmentIdOf(username);
  const { lift_bindings: bindings } = await activeEnrollmentOf(username);
  const clock = sessionClock(topSets.length + 1);
  for (const top of topSets) {
    const startedAt = clock.next();
    const response = await postCompleteSession(accessToken, {
      id: randomUUID(),
      startedAt: startedAt.toISOString(),
      endedAt: new Date(startedAt.getTime() + SESSION_MS).toISOString(),
      notes: null,
      program: { enrollmentId, position: { week: 1, day: top.lift } },
      sets: rpeDaySets(bindings, top),
    });
    if (response.status !== 200 || response.body.programLinked !== true)
      throw new Error(`seeding ${top.lift} failed: ${response.status} ${response.rawBody}`);
  }
}

async function expectWeekTwo(page: Page, days: readonly WeekTwoDay[]): Promise<void> {
  await page.reload();
  await openTab(page, 'Train');
  const today: Locator = programToday(page, RPE);
  await expect(today).toBeVisible();
  await expect(dayPicker(today).getByRole('radio', { name: 'W2 Day 1', exact: true })).toBeChecked();
  for (const { day, exercise, topRow, backOffRow } of days) {
    await dayPicker(today)
      .getByRole('radio', { name: `W2 ${day}`, exact: true })
      .click();
    await expect(today.getByRole('button', { name: `Start: ${RPE} — W2 ${day}`, exact: true })).toBeVisible();
    await expect(prescribedRows(today, exercise)).toHaveText([topRow]);
    await expect(prescribedRows(today, `${exercise} — supplemental`)).toHaveText(repeated(backOffRow, BACK_OFF_SETS));
  }
}

test('RPE re-estimates each e1RM from the logged top set: squat 172.5 × 5 @ RPE 8 → 172.5 / 0.811 = 212.70, W2 top 212.70 × 0.863 = 183.56 → 182.5, back-offs 173.375 → 172.5; bench 107.5 × 3 @ RPE 8 → 107.5 / 0.863 = 124.57, W2 top 107.5, back-offs 102.125 → 102.5; deadlift 207.5 × 3 @ RPE 9 → 207.5 / 0.892 = 232.62, W2 top 200.75 → 200, back-offs 190', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seedWeekOne(page, 'pf_rpe', [
    { lift: 'squat', prescribedKg: 172.5, loggedKg: 172.5, reps: 5, effort: { type: 'rpe', value: 8 } },
    { lift: 'bench', prescribedKg: 102.5, loggedKg: 107.5, reps: 3, effort: { type: 'rpe', value: 8 } },
    { lift: 'deadlift', prescribedKg: 207.5, loggedKg: 207.5, reps: 3, effort: { type: 'rpe', value: 9 } },
  ]);

  await expectWeekTwo(page, [
    {
      day: 'Day 1',
      exercise: 'Back Squat',
      topRow: '182.5 kg × 3 · 86.3%',
      backOffRow: '172.5 kg × 3 · 95% · optional',
    },
    {
      day: 'Day 2',
      exercise: 'Barbell Bench Press',
      topRow: '107.5 kg × 3 · 86.3%',
      backOffRow: '102.5 kg × 3 · 95% · optional',
    },
    {
      day: 'Day 3',
      exercise: 'Deadlift',
      topRow: '200 kg × 3 · 86.3%',
      backOffRow: '190 kg × 3 · 95% · optional',
    },
  ]);
});

test('RPE reads RIR as RPE 10 − RIR but needs a number to re-estimate: squat 172.5 × 5 @ RIR 2 = RPE 8 → W2 top 182.5, while a bench top set logged only as "hard" keeps the e1RM 120 (W2 top 120 × 0.863 = 103.56 → 102.5, back-offs 97.375 → 97.5)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seedWeekOne(page, 'pf_rpek', [
    { lift: 'squat', prescribedKg: 172.5, loggedKg: 172.5, reps: 5, effort: { type: 'rir', value: 2 } },
    { lift: 'bench', prescribedKg: 102.5, loggedKg: 102.5, reps: 3, effort: { type: 'level', level: 'hard' } },
    { lift: 'deadlift', prescribedKg: 207.5, loggedKg: 207.5, reps: 3, effort: { type: 'rpe', value: 8 } },
  ]);

  await expectWeekTwo(page, [
    {
      day: 'Day 1',
      exercise: 'Back Squat',
      topRow: '182.5 kg × 3 · 86.3%',
      backOffRow: '172.5 kg × 3 · 95% · optional',
    },
    {
      day: 'Day 2',
      exercise: 'Barbell Bench Press',
      topRow: '102.5 kg × 3 · 86.3%',
      backOffRow: '97.5 kg × 3 · 95% · optional',
    },
  ]);
});
