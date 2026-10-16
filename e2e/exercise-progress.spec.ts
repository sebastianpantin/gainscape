import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  finishWorkout,
  logExercise,
  openLatestWorkout,
  openSetOptions,
  openTab,
  readSession,
  register,
  setRow,
  uniqueUsername,
} from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf, spreadSessionsDays } from './support/db.ts';
import { followProgram } from './support/program-enrollment.ts';
import { fiveRepSets, type SeededDay, seedProgramDays, sessionClock } from './support/program-seed.ts';

const BENCH = 'Barbell Bench Press';

async function expectBenchProgress(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: BENCH })).toBeVisible();
  await expect(page.getByRole('img', { name: /^e1RM and top set per workout\./ })).toHaveAccessibleName(
    'e1RM and top set per workout. e1RM from 74 kg to 86.33 kg over 2 points. Top set from 60 kg to 70 kg over 2 points.',
  );
}

test('the progress screen charts e1RM and top set without warm-ups and lists rep maxes with their day', async ({
  page,
}) => {
  await register(page, uniqueUsername('pg'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', BENCH, [
    { weightKg: 100, reps: 1 },
    { weightKg: 60, reps: 5 },
  ]);
  const firstSet = setRow(page, 1);
  await openSetOptions(firstSet, 1);
  await firstSet.getByRole('button', { name: 'Warm-up set 1', exact: true }).click();
  await finishWorkout(page);

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', BENCH, [{ weightKg: 70, reps: 5 }]);
  await page.getByRole('link', { name: `${BENCH} progress` }).click();
  await expect(page.getByRole('heading', { level: 1, name: BENCH })).toBeVisible();
  await expect(page.getByRole('img', { name: /^e1RM and top set per workout\./ })).toHaveAccessibleName(
    'e1RM and top set per workout. e1RM 74 kg, 1 point. Top set 60 kg, 1 point.',
  );

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(11);
  await expect(rows.nth(1)).toHaveText(['1RM', '60 kg', today].join(''));
  await expect(rows.nth(5)).toHaveText(['5RM', '60 kg', today].join(''));
  await expect(rows.nth(6)).toHaveText('6RM——');

  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible();
  await finishWorkout(page);

  await openTab(page, 'Collection');
  await page.getByRole('link', { name: `${BENCH} progress` }).click();
  await expectBenchProgress(page);
  await expect(page.getByRole('table').getByRole('row').nth(5)).toHaveText(['5RM', '70 kg', today].join(''));

  await openLatestWorkout(page);
  await page.getByRole('link', { name: `${BENCH} progress` }).click();
  await expectBenchProgress(page);
});

test('a bodyweight exercise charts its most reps and shows its reps record', async ({ page }) => {
  await register(page, uniqueUsername('pb'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 8 }, { reps: 10 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();

  await openTab(page, 'Collection');
  await page.getByRole('link', { name: 'Pull-up progress' }).click();
  await expect(page.getByRole('img', { name: /^Most reps per workout\./ })).toHaveAccessibleName(
    'Most reps per workout. Most reps 10, 1 point.',
  );
  await expect(page.getByRole('region', { name: 'Most reps' })).toContainText('10 reps');
});

test('a lift with no gain in five workouts over four weeks is tagged Stalled with three tips', async ({ page }) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('ps');
  await register(page, username);
  for (let workout = 0; workout < 5; workout++) {
    await openTab(page, 'Train');
    await page.getByRole('button', { name: 'Start workout' }).click();
    await logExercise(page, 'bench', BENCH, [{ weightKg: 60, reps: 5 }]);
    await finishWorkout(page);
  }
  await spreadSessionsDays(username, 7);

  await openTab(page, 'Collection');
  await page.getByRole('link', { name: `${BENCH} progress` }).click();
  await expect(page.getByRole('heading', { level: 1, name: BENCH })).toBeVisible();
  await expect(page.getByText('Stalled', { exact: true })).toBeVisible();
  const tips = page.getByRole('region', { name: 'Get past the stall' }).getByRole('listitem');
  await expect(tips).toHaveText([
    'Deload: drop to about 55 kg for a week, then build back up.',
    'Change the rep range: try sets of 8 to 10 for a few weeks.',
    'Swap in a close variation for a few weeks.',
  ]);
  await expect(page.getByRole('button', { name: 'What does Stalled mean?' })).toBeVisible();
});

function squatDay(index: number, slot: string): SeededDay {
  return { position: { index }, sets: fiveRepSets(slot, 'squat', 60, 3) };
}

test('a lift a program drives is never tagged Stalled, even with no gain', async ({ page }) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('pp');
  await register(page, username);
  await followProgram(page, 'Starting Strength', {
    'Squat working weight (kg)': 60,
    'Bench press working weight (kg)': 50,
    'Press working weight (kg)': 35,
    'Deadlift working weight (kg)': 80,
  });
  const { access_token: accessToken } = await readSession(page);
  const enrollmentId = await activeEnrollmentIdOf(username);
  const { lift_bindings: bindings } = await activeEnrollmentOf(username);
  await seedProgramDays(
    accessToken,
    enrollmentId,
    bindings,
    sessionClock(6),
    [0, 1, 2, 3, 4].map((index) => squatDay(index, index % 2 === 0 ? 'a-squat' : 'b-squat')),
  );
  await spreadSessionsDays(username, 7);

  await page.goto('/collection');
  await page.getByRole('link', { name: 'Back Squat progress' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Back Squat' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^e1RM and top set per workout\./ })).toBeVisible();
  await expect(page.getByText('Stalled', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Get past the stall' })).toHaveCount(0);
});
