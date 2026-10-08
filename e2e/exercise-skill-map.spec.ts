import { expect, test } from '@playwright/test';
import { openTab, register, uniqueUsername } from './support/app.ts';
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

test('the skill panel lists the exercises that train the skill, highest share first', async ({ page }) => {
  await register(page, uniqueUsername('skpanel'));

  await openTab(page, 'Skills');
  await page.getByRole('button', { name: /^Chest\b/ }).click();
  const chest = page.getByRole('list', { name: 'Exercises that train Chest' });
  const items = chest.getByRole('listitem');
  await expect(items).toHaveCount(11);
  await expect(items.nth(0)).toHaveText('Cable Fly 90%');
  await expect(items.nth(1)).toHaveText('Pec Deck 90%');
  await expect(items.nth(2)).toHaveText('Barbell Bench Press 70%');
  await expect(items.nth(3)).toHaveText('Dumbbell Bench Press 70%');
  await expect(items.filter({ hasText: 'Incline Barbell Bench Press 60%' })).toHaveCount(1);
  await expect(items.filter({ hasText: 'Pause Bench Press' })).toHaveCount(0);
});
