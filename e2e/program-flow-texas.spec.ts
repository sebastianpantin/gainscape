import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { openTab, readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import { dayPicker, followProgram, prescribedRows, programToday } from './support/program-enrollment.ts';
import { type SeededDay, type SeededSet, seedProgramDays, sessionClock } from './support/program-seed.ts';

const TEXAS = 'Texas Method';
const FAILED_FRIDAY_REPS = 4;

interface TexasWeek {
  week: number;
  mondayKg: { squat: number; press: number; deadlift: number };
  wednesdaySquatKg: number;
  fridayKg: { squat: number; press: number };
  fridaySquatReps?: number;
}

function sets(slot: string, lift: string, weightKg: number, count: number, loggedReps?: number): SeededSet[] {
  return Array.from({ length: count }, (_, index) => {
    const set = { lift, ref: `${slot}:${index}`, weightKg, reps: 5 };
    return loggedReps === undefined ? set : { ...set, loggedReps };
  });
}

function texasWeek({ week, mondayKg, wednesdaySquatKg, fridayKg, fridaySquatReps }: TexasWeek): SeededDay[] {
  return [
    {
      position: { week, day: 'mon' },
      sets: [
        ...sets('mon-squat', 'squat', mondayKg.squat, 5),
        ...sets('mon-press', 'press', mondayKg.press, 5),
        ...sets('mon-deadlift', 'deadlift', mondayKg.deadlift, 1),
      ],
    },
    { position: { week, day: 'wed' }, sets: sets('wed-squat', 'squat', wednesdaySquatKg, 2) },
    {
      position: { week, day: 'fri' },
      sets: [
        ...sets('fri-squat', 'squat', fridayKg.squat, 1, fridaySquatReps),
        ...sets('fri-press', 'press', fridayKg.press, 1),
      ],
    },
  ];
}

const WEEK_ONE: TexasWeek = {
  week: 1,
  mondayKg: { squat: 135, press: 90, deadlift: 180 },
  wednesdaySquatKg: 107.5,
  fridayKg: { squat: 152.5, press: 102.5 },
};

async function followTexasThroughWeekOne(page: Page, prefix: string, weekOne: TexasWeek): Promise<Locator> {
  await test.step('follow Texas Method at squat 150, bench 100 and deadlift 180, and seed week 1', async () => {
    const username = uniqueUsername(prefix);
    await register(page, username);
    await followProgram(page, TEXAS, {
      'Squat 5RM (kg)': 150,
      'Bench press or overhead press 5RM (kg)': 100,
      'Deadlift working weight (kg)': 180,
    });
    const { access_token: accessToken } = await readSession(page);
    const { lift_bindings: bindings } = await activeEnrollmentOf(username);
    const days = texasWeek(weekOne);
    await seedProgramDays(
      accessToken,
      await activeEnrollmentIdOf(username),
      bindings,
      sessionClock(days.length + 1),
      days,
    );
  });
  return await test.step('Train suggests W2 Day 1', async () => {
    await page.reload();
    await openTab(page, 'Train');
    const today = programToday(page, TEXAS);
    await expect(dayPicker(today).getByRole('radio', { name: 'W2 Day 1', exact: true })).toBeChecked();
    return today;
  });
}

async function showDay(today: Locator, day: string): Promise<void> {
  await dayPicker(today)
    .getByRole('radio', { name: `W2 ${day}`, exact: true })
    .click();
  await expect(today.getByRole('button', { name: `Start: ${TEXAS} — W2 ${day}`, exact: true })).toBeVisible();
}

test('Texas Method after a met W1 Friday (squat 150 + 2.5 = 152.5, bench 100 + 2.5 = 102.5) raises both 5RMs by 2.5: W2 Monday 5×5 at 152.5 × 0.9 = 137.25 → 137.5 and 102.5 × 0.9 = 92.25 → 92.5, Wednesday squat 137.5 × 0.8 = 110, Friday 152.5 + 2.5 = 155 and 102.5 + 2.5 = 105, and the met Monday deadlift 180 + 2.5 = 182.5', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const today = await followTexasThroughWeekOne(page, 'pf_tx', WEEK_ONE);

  await test.step('W2 Monday: squat 137.5, bench 92.5, deadlift 182.5', async () => {
    await expect(prescribedRows(today, 'Back Squat')).toHaveText(['5 × 5 @ 137.5 kg · 90%']);
    await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText(['5 × 5 @ 92.5 kg · 90%']);
    await expect(prescribedRows(today, 'Deadlift')).toHaveText(['182.5 kg × 5']);
  });

  await test.step('W2 Wednesday: squat 110', async () => {
    await showDay(today, 'Day 2');
    await expect(prescribedRows(today, 'Back Squat')).toHaveText(['2 × 5 @ 110 kg · 80%']);
  });

  await test.step('W2 Friday: squat 155, bench 105', async () => {
    await showDay(today, 'Day 3');
    await expect(prescribedRows(today, 'Back Squat')).toHaveText(['155 kg × 5']);
    await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText(['105 kg × 5']);
  });
});

test('Texas Method with a 4-rep W1 Friday squat holds the squat 5RM at 150 while the met bench rises to 102.5: W2 Monday squat stays 150 × 0.9 = 135, Wednesday 135 × 0.8 = 108 → 107.5, Friday 150 + 2.5 = 152.5, bench Monday 92.5 and Friday 105', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const today = await followTexasThroughWeekOne(page, 'pf_txm', { ...WEEK_ONE, fridaySquatReps: FAILED_FRIDAY_REPS });

  await test.step('W2 Monday: squat held at 135, bench 92.5', async () => {
    await expect(prescribedRows(today, 'Back Squat')).toHaveText(['5 × 5 @ 135 kg · 90%']);
    await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText(['5 × 5 @ 92.5 kg · 90%']);
  });

  await test.step('W2 Wednesday: squat 107.5', async () => {
    await showDay(today, 'Day 2');
    await expect(prescribedRows(today, 'Back Squat')).toHaveText(['2 × 5 @ 107.5 kg · 80%']);
  });

  await test.step('W2 Friday: squat 152.5, bench 105', async () => {
    await showDay(today, 'Day 3');
    await expect(prescribedRows(today, 'Back Squat')).toHaveText(['152.5 kg × 5']);
    await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText(['105 kg × 5']);
  });
});
