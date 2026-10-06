import { expect, type Page, test } from '@playwright/test';
import { finishWorkout, logExercise, openLatestWorkout, openTab, register, uniqueUsername } from './support/app.ts';

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
  await page.getByRole('button', { name: 'Warm-up set 1', exact: true }).click();
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

  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible();
  await finishWorkout(page);

  await openTab(page, 'Log');
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

  await openTab(page, 'Log');
  await page.getByRole('link', { name: 'Pull-up progress' }).click();
  await expect(page.getByRole('img', { name: /^Most reps per workout\./ })).toHaveAccessibleName(
    'Most reps per workout. Most reps 10, 1 point.',
  );
  await expect(page.getByRole('region', { name: 'Most reps' })).toContainText('10 reps');
});
