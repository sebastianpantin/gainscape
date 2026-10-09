import { expect, type Page, test } from '@playwright/test';
import { register, uniqueUsername } from './support/app.ts';
import { workoutCards } from './support/program-enrollment.ts';

const BENCH = 'Barbell Bench Press';
const ROW = 'Barbell Row';
const SQUAT = 'Back Squat';
const DEADLIFT = 'Deadlift';

async function addExercise(page: Page, search: string, exerciseName: string) {
  await page.getByPlaceholder('Add exercise…').fill(search);
  await page.getByRole('button', { name: new RegExp(`^${exerciseName}\\b`) }).click();
  await expect(page.getByRole('heading', { name: exerciseName, exact: true })).toBeVisible();
}

async function chooseFromMenu(page: Page, exerciseName: string, action: string) {
  await page.getByLabel(`Exercise menu for ${exerciseName}`, { exact: true }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
}

function swapPicker(page: Page) {
  return page.getByPlaceholder('Swap for…');
}

test('the swap picker stays with its exercise when an exercise above it is removed', async ({ page }) => {
  await register(page, uniqueUsername('swap'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addExercise(page, 'bench', BENCH);
  await addExercise(page, 'barbell row', ROW);
  await addExercise(page, 'back squat', SQUAT);

  await chooseFromMenu(page, ROW, 'Swap');
  await expect(workoutCards(page, ROW).getByPlaceholder('Swap for…')).toBeVisible();
  await chooseFromMenu(page, BENCH, 'Remove');
  await expect(page.getByRole('heading', { name: BENCH, exact: true })).toHaveCount(0);
  await expect(swapPicker(page)).toHaveCount(1);
  await expect(workoutCards(page, ROW).getByPlaceholder('Swap for…')).toBeVisible();

  await swapPicker(page).fill('deadlift');
  await page.getByRole('button', { name: new RegExp(`^${DEADLIFT}\\b`) }).click();
  await expect(page.locator('.exercise-card').getByRole('heading', { level: 2 })).toHaveText([DEADLIFT, SQUAT]);
});

test('discard an ongoing workout behind a confirm, and start the next one fresh', async ({ page }) => {
  await register(page, uniqueUsername('discard'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addExercise(page, 'bench', BENCH);
  await chooseFromMenu(page, BENCH, 'Swap');
  await expect(swapPicker(page)).toBeVisible();

  await page.getByRole('button', { name: 'Discard workout' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard this workout?' });
  await expect(dialog).toContainText('Your logged sets will be lost.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: BENCH, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Discard workout' }).click();
  await dialog.getByRole('button', { name: 'Discard workout' }).click();
  await expect(page.getByRole('heading', { name: BENCH, exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Start workout' }).click();
  await addExercise(page, 'bench', BENCH);
  await expect(swapPicker(page)).toHaveCount(0);
});
