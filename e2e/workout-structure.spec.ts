import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { addExercise, chooseFromMenu, exerciseCard, register, uniqueUsername } from './support/app.ts';

const BENCH = 'Barbell Bench Press';
const ROW = 'Barbell Row';
const SQUAT = 'Back Squat';
const DEADLIFT = 'Deadlift';

async function addUnloggedExercise(page: Page, search: string, exerciseName: string) {
  const card = await addExercise(page, search, exerciseName);
  await expect(card.getByRole('button', { name: 'Done set 1' })).toHaveAttribute('aria-pressed', 'false');
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
  await expect(exerciseCard(page, ROW).getByPlaceholder('Swap for…')).toBeVisible();
  await chooseFromMenu(page, BENCH, 'Remove exercise');
  await expect(page.getByRole('heading', { name: BENCH, exact: true })).toHaveCount(0);
  await expect(swapPicker(page)).toHaveCount(1);
  await expect(exerciseCard(page, ROW).getByPlaceholder('Swap for…')).toBeVisible();

  await swapPicker(page).fill('deadlift');
  await page.getByRole('button', { name: new RegExp(`^${DEADLIFT}\\b`) }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([DEADLIFT, SQUAT]);
});

test('the swap picker stays on the second of two identical exercises when the first is removed', async ({ page }) => {
  await register(page, uniqueUsername('swap_twin'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addUnloggedExercise(page, 'bench', BENCH);
  const benchCards = await addExercise(page, 'bench', BENCH);
  await expect(benchCards).toHaveCount(2);
  await expect(benchCards.nth(1).getByRole('button', { name: 'Done set 1' })).toHaveAttribute('aria-pressed', 'false');

  const benchMenus = page.getByLabel(`Exercise menu for ${BENCH}`, { exact: true });
  await benchMenus.nth(1).click();
  await page.getByRole('button', { name: 'Swap', exact: true }).click();
  await expect(benchCards.nth(1).getByPlaceholder('Swap for…')).toBeVisible();
  await benchMenus.nth(0).click();
  await page.getByRole('button', { name: 'Remove exercise', exact: true }).click();

  await expect(benchCards).toHaveCount(1);
  await expect(benchCards.getByPlaceholder('Swap for…')).toBeVisible();
});

test('removing an exercise with a logged set asks first, and one with nothing logged goes straight away', async ({
  page,
}) => {
  await register(page, uniqueUsername('remove_ask'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const bench = await addExercise(page, 'bench', BENCH);
  await addUnloggedExercise(page, 'barbell row', ROW);
  await bench.getByRole('button', { name: 'Done set 1' }).click();

  await chooseFromMenu(page, BENCH, 'Remove exercise');
  const dialog = page.getByRole('dialog', { name: `Remove ${BENCH}?` });
  await expect(dialog).toContainText('Its sets will be lost.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: BENCH, exact: true })).toBeVisible();

  await chooseFromMenu(page, BENCH, 'Remove exercise');
  await dialog.getByRole('button', { name: 'Remove exercise' }).click();
  await expect(page.getByRole('heading', { name: BENCH, exact: true })).toHaveCount(0);

  await chooseFromMenu(page, ROW, 'Remove exercise');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: ROW, exact: true })).toHaveCount(0);
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

test('the swap picker suggests similar exercises until the user types, and a suggestion swaps the lift', async ({
  page,
}) => {
  await register(page, uniqueUsername('swap_similar'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addUnloggedExercise(page, 'back squat', SQUAT);

  await chooseFromMenu(page, SQUAT, 'Swap');
  const similar = exerciseCard(page, SQUAT).getByRole('region', { name: 'Similar exercises' });
  await expect(similar.getByRole('button', { name: /^Box Squat\b/ })).toBeVisible();
  await expect(similar.getByRole('button', { name: /^Barbell Bench Press\b/ })).toHaveCount(0);

  await swapPicker(page).fill('dead');
  await expect(similar).toHaveCount(0);
  await swapPicker(page).fill('');

  await similar.getByRole('button', { name: /^Box Squat\b/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(['Box Squat']);
});

test('an empty workout says why Finish is off and asks for session RPE only once it has an exercise', async ({
  page,
}) => {
  await register(page, uniqueUsername('empty'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const finish = page.getByRole('button', { name: 'Finish workout' });
  const sessionRpe = page.getByRole('combobox', { name: 'Session RPE (optional)' });
  await expect(finish).toBeDisabled();
  await expect(finish).toHaveAccessibleDescription('Add an exercise to finish.');
  await expect(sessionRpe).toHaveCount(0);

  await addUnloggedExercise(page, 'bench', BENCH);
  await expect(finish).toBeEnabled();
  await expect(page.getByText('Add an exercise to finish.')).toHaveCount(0);
  await expect(sessionRpe).toBeVisible();
});

test('the exercise menu closes on Escape and on a tap outside it', async ({ page }) => {
  await register(page, uniqueUsername('menu'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addUnloggedExercise(page, 'bench', BENCH);
  const menu = page.getByLabel(`Exercise menu for ${BENCH}`, { exact: true });
  const swap = page.getByRole('button', { name: 'Swap', exact: true });

  await menu.click();
  await expect(swap).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(swap).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await expect(swap).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(swap).toBeHidden();
});
