import { expect, test } from '@playwright/test';
import { logExercise, register } from './support/app.ts';

test('bodyweight prompt, records and the collection log', async ({ page }) => {
  await register(page, `e2e_${Date.now().toString(36)}`);

  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [
    { weightKg: 60, reps: 5 },
    { weightKg: 60, reps: 5 },
  ]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 8 }, { reps: 8 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();

  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect(page.getByLabel('New records')).toHaveCount(0);

  await page.getByRole('link', { name: 'Workout' }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 70, reps: 5 }]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 10 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();

  const records = page.getByLabel('New records');
  await expect(records).toContainText('Barbell Bench Press: 5RM 70 kg (was 60 kg)');
  await expect(records).toContainText('Pull-up: 10 reps (was 8)');

  await page.getByRole('link', { name: 'Collection' }).click();
  await expect(page.getByTestId('collection-completion')).toHaveText('18% (2/11)');
  const bench = page.locator('section', {
    has: page.getByRole('heading', { name: 'Barbell Bench Press', exact: true }),
  });
  await expect(bench.locator('.record-slot.filled')).toHaveText(['5RM 70 kg']);
  await expect(bench).toContainText('e1RM');
});
