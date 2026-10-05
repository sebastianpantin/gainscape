import { expect, type Page, test } from '@playwright/test';
import { logExercise, logWorkout, openTab, register, uniqueUsername } from './support/app.ts';

function exerciseCard(page: Page, name: string) {
  return page.locator('section', { has: page.getByRole('heading', { name, exact: true }) });
}

test('an exercise shows last session and starts from its first set', async ({ page }) => {
  await register(page, uniqueUsername('lt'));
  await logWorkout(page, () =>
    logExercise(page, 'bench', 'Barbell Bench Press', [
      { weightKg: 60, reps: 5 },
      { weightKg: 62.5, reps: 4 },
    ]),
  );

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('bench');
  await page.getByRole('button', { name: /^Barbell Bench Press\b/ }).click();
  const bench = exerciseCard(page, 'Barbell Bench Press');
  await expect(bench.getByText('Last: 1×5 @ 60 kg, 1×4 @ 62.5 kg')).toBeVisible();
  const firstSet = bench.locator('li.set-row').first();
  await expect(firstSet.getByLabel('kg', { exact: true })).toHaveValue('60');
  await expect(firstSet.getByLabel('reps', { exact: true })).toHaveValue('5');

  await page.getByLabel('Search exercises').fill('squat');
  await page.getByRole('button', { name: /^Back Squat\b/ }).click();
  const squat = exerciseCard(page, 'Back Squat');
  await expect(squat.locator('li.set-row').first().getByLabel('kg', { exact: true })).toHaveValue('20');
  await expect(squat.getByText(/^Last:/)).toHaveCount(0);
});
