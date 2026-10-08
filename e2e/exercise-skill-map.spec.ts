import { expect, test } from '@playwright/test';
import { register, uniqueUsername } from './support/app.ts';
import { builtInExerciseId } from './support/db.ts';

test('the picker and the exercise screen show the skills an exercise trains', async ({ page }) => {
  await register(page, uniqueUsername('skmap'));

  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('bench');
  await expect(page.getByRole('button', { name: /^Barbell Bench Press\b/ })).toContainText('Chest · Shoulders · Arms');
  await page.getByLabel('Search exercises').fill('running');
  await expect(page.getByRole('button', { name: /^Running\b/ })).toContainText('Endurance');

  await page.goto(`/collection/exercises/${await builtInExerciseId('barbell_bench_press')}`);
  const trains = page.getByRole('region', { name: 'Trains' });
  await expect(trains.getByRole('listitem')).toHaveText(['Chest 70%', 'Shoulders 20%', 'Arms 10%']);
  await expect(page.getByText('Log this exercise to see your progress.')).toBeVisible();
});
