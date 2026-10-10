import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
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

async function addUnloggedExercise(page: Page, search: string, exerciseName: string) {
  await addExercise(page, search, exerciseName);
  const doneButton = workoutCards(page, exerciseName).getByRole('button', { name: 'Done set 1' });
  await doneButton.click();
  await expect(doneButton).toHaveAttribute('aria-pressed', 'false');
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
  await addUnloggedExercise(page, 'bench', BENCH);
  await addUnloggedExercise(page, 'barbell row', ROW);
  await addUnloggedExercise(page, 'back squat', SQUAT);

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

test('the swap picker stays on the second of two identical exercises when the first is removed', async ({ page }) => {
  await register(page, uniqueUsername('swap_twin'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addUnloggedExercise(page, 'bench', BENCH);
  await page.getByPlaceholder('Add exercise…').fill('bench');
  await page.getByRole('button', { name: new RegExp(`^${BENCH}\\b`) }).click();
  const benchCards = workoutCards(page, BENCH);
  await expect(benchCards).toHaveCount(2);
  const secondDone = benchCards.nth(1).getByRole('button', { name: 'Done set 1' });
  await secondDone.click();
  await expect(secondDone).toHaveAttribute('aria-pressed', 'false');

  const benchMenus = page.getByLabel(`Exercise menu for ${BENCH}`, { exact: true });
  await benchMenus.nth(1).click();
  await page.getByRole('button', { name: 'Swap', exact: true }).click();
  await expect(benchCards.nth(1).getByPlaceholder('Swap for…')).toBeVisible();
  await benchMenus.nth(0).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect(benchCards).toHaveCount(1);
  await expect(benchCards.getByPlaceholder('Swap for…')).toBeVisible();
});

test('discard an ongoing workout behind a confirm, and start the next one fresh', async ({ page }) => {
  await register(page, uniqueUsername('discard'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addUnloggedExercise(page, 'bench', BENCH);
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
