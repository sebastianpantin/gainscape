import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import { dayPicker, followProgram, openProgramToday, prescribedRows, repeated } from './support/program-enrollment.ts';
import {
  nearestPlateKg,
  type SeededDay,
  type SeededEffort,
  seedProgramDays,
  sessionClock,
} from './support/program-seed.ts';

const RPE = 'RPE top set with back-offs';
const BACK_OFF_SETS = 5;
const BACK_OFF_PCT = 0.95;
const PRESCRIBED_REPS = 3;

type RpeLift = 'squat' | 'bench' | 'deadlift';

interface LoggedTopSet {
  lift: RpeLift;
  prescribedKg: number;
  loggedKg: number;
  reps: number;
  effort: SeededEffort;
}

interface WeekTwoDay {
  day: string;
  exercise: string;
  topRow: string;
  backOffRow: string;
}

function weekOneDay(top: LoggedTopSet): SeededDay {
  const backOffKg = nearestPlateKg(top.prescribedKg * BACK_OFF_PCT);
  const topSet = {
    lift: top.lift,
    ref: `${top.lift}-top:0`,
    weightKg: top.prescribedKg,
    reps: PRESCRIBED_REPS,
    loggedWeightKg: top.loggedKg,
    loggedReps: top.reps,
    effort: top.effort,
  };
  const backOffs = Array.from({ length: BACK_OFF_SETS }, (_, index) => ({
    lift: top.lift,
    ref: `${top.lift}-fatigue:${index}`,
    weightKg: backOffKg,
    reps: PRESCRIBED_REPS,
    effort: top.effort,
  }));
  return { position: { week: 1, day: top.lift }, sets: [topSet, ...backOffs] };
}

async function seedWeekOne(page: Page, prefix: string, topSets: readonly LoggedTopSet[]): Promise<void> {
  const username = uniqueUsername(prefix);
  await test.step('follow RPE at e1RMs squat 200, bench 120 and deadlift 240', async () => {
    await register(page, username);
    await followProgram(page, RPE, {
      'Squat estimated 1RM (kg)': 200,
      'Bench press estimated 1RM (kg)': 120,
      'Deadlift estimated 1RM (kg)': 240,
    });
  });
  await test.step('seed the week 1 top sets and back-offs', async () => {
    const { access_token: accessToken } = await readSession(page);
    const enrollmentId = await activeEnrollmentIdOf(username);
    const { lift_bindings: bindings } = await activeEnrollmentOf(username);
    const clock = sessionClock(topSets.length + 1);
    await seedProgramDays(accessToken, enrollmentId, bindings, clock, topSets.map(weekOneDay));
  });
}

async function expectWeekTwo(page: Page, days: readonly WeekTwoDay[]): Promise<void> {
  const today = await test.step('Train suggests W2 Day 1', async () => {
    const programToday = await openProgramToday(page, RPE);
    await expect(dayPicker(programToday).getByRole('radio', { name: 'W2 Day 1', exact: true })).toBeChecked();
    return programToday;
  });
  for (const { day, exercise, topRow, backOffRow } of days) {
    await test.step(`W2 ${day}: ${exercise} top set ${topRow}, back-offs ${backOffRow}`, async () => {
      await dayPicker(today)
        .getByRole('radio', { name: `W2 ${day}`, exact: true })
        .click();
      await expect(today.getByRole('button', { name: `Start: ${RPE} — W2 ${day}`, exact: true })).toBeVisible();
      await expect(prescribedRows(today, exercise)).toHaveText([topRow]);
      await expect(prescribedRows(today, `${exercise} — supplemental`)).toHaveText(repeated(backOffRow, BACK_OFF_SETS));
    });
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
