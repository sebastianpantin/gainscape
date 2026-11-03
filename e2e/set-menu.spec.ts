import { type Locator } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { addExercise, openSetOptions, openTab, register, setRow, setRows, uniqueUsername } from './support/app.ts';

const BENCH = 'Barbell Bench Press';

function optionsButton(card: Locator, setNumber: number): Locator {
  return setRow(card, setNumber).getByRole('button', { name: `Set ${setNumber} options`, exact: true });
}

async function removeSet(card: Locator, setNumber: number): Promise<void> {
  await openSetOptions(setRow(card, setNumber), setNumber);
  await setRow(card, setNumber)
    .getByRole('button', { name: `Remove set ${setNumber}`, exact: true })
    .click();
}

test('an open set menu closes when the page scrolls instead of drifting away from its row', async ({ page }) => {
  await register(page, uniqueUsername('menu_scroll'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'bench', BENCH);
  for (let added = 0; added < 4; added++) await card.getByRole('button', { name: '+ Add set' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  const row = setRow(card, 1);
  await openSetOptions(row, 1);
  await page.evaluate(() => window.scrollBy(0, 120));
  await expect(row.getByRole('group', { name: 'Set 1 options', exact: true })).toBeHidden();
});

test('removing a set moves focus to the next row, else the previous row, else Add set', async ({ page }) => {
  await register(page, uniqueUsername('menu_focus'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'bench', BENCH);
  const addSet = card.getByRole('button', { name: '+ Add set' });
  await addSet.click();
  await addSet.click();
  await expect(setRows(card)).toHaveCount(3);

  await removeSet(card, 2);
  await expect(setRows(card)).toHaveCount(2);
  await expect(optionsButton(card, 2)).toBeFocused();

  await removeSet(card, 2);
  await expect(setRows(card)).toHaveCount(1);
  await expect(optionsButton(card, 1)).toBeFocused();

  await removeSet(card, 1);
  await expect(setRows(card)).toHaveCount(0);
  await expect(addSet).toBeFocused();
});

test('a removed set comes back where it was with Undo', async ({ page }) => {
  await register(page, uniqueUsername('menu_undo'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'bench', BENCH);
  await card.getByRole('button', { name: '+ Add set' }).click();
  await card.getByRole('button', { name: '+ Add set' }).click();
  const weight = (setNumber: number) =>
    setRow(card, setNumber).getByRole('spinbutton', { name: `Weight in kg, set ${setNumber}`, exact: true });
  await weight(2).fill('72.5');
  await weight(2).press('Tab');

  await removeSet(card, 2);
  await expect(setRows(card)).toHaveCount(2);
  const toast = page.getByRole('status').filter({ hasText: `Removed set 2 of ${BENCH}.` });
  await toast.getByRole('button', { name: 'Undo' }).click();

  await expect(setRows(card)).toHaveCount(3);
  await expect(weight(2)).toHaveValue('72.5');
  await expect(optionsButton(card, 2)).toBeFocused();
  await expect(toast).toHaveCount(0);
});

test('two sets removed in a row each keep their Undo', async ({ page }) => {
  await register(page, uniqueUsername('menu_two_undo'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'bench', BENCH);
  await card.getByRole('button', { name: '+ Add set' }).click();
  await card.getByRole('button', { name: '+ Add set' }).click();

  await removeSet(card, 3);
  await removeSet(card, 2);
  await expect(setRows(card)).toHaveCount(1);
  const undos = page.getByRole('status').getByRole('button', { name: /^Undo: Removed set \d of / });
  await expect(undos).toHaveCount(2);

  await undos.first().click();
  await expect(setRows(card)).toHaveCount(2);
  await undos.first().click();
  await expect(setRows(card)).toHaveCount(3);
});

test('a set removed from the keyboard keeps its Undo until dismissed', async ({ page }) => {
  await register(page, uniqueUsername('menu_key_undo'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'bench', BENCH);
  await card.getByRole('button', { name: '+ Add set' }).click();

  await optionsButton(card, 2).press('Enter');
  await setRow(card, 2).getByRole('button', { name: 'Remove set 2', exact: true }).press('Enter');
  await expect(setRows(card)).toHaveCount(1);
  const toasts = page.getByRole('status').filter({ hasText: `Removed set 2 of ${BENCH}.` });
  await expect(toasts.getByRole('button', { name: /^Undo: / })).toBeVisible();

  await toasts.getByRole('button', { name: `Dismiss: Removed set 2 of ${BENCH}.`, exact: true }).click();
  await expect(page.getByRole('status').getByText(`Removed set 2 of ${BENCH}.`)).toHaveCount(0);
});

test('an Undo toast closes when the user leaves the screen it belongs to', async ({ page }) => {
  await register(page, uniqueUsername('menu_leave_undo'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'bench', BENCH);
  await card.getByRole('button', { name: '+ Add set' }).click();

  await optionsButton(card, 2).press('Enter');
  await setRow(card, 2).getByRole('button', { name: 'Remove set 2', exact: true }).press('Enter');
  const removed = page.getByRole('status').getByText(`Removed set 2 of ${BENCH}.`);
  await expect(removed).toBeVisible();
  await openTab(page, 'Skills');
  await expect(removed).toHaveCount(0);
});

test('effort chips are one tab stop that arrow keys move through', async ({ page }) => {
  await register(page, uniqueUsername('menu_effort_keys'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'bench', BENCH);
  const effort = setRow(card, 1).getByRole('radiogroup', { name: 'Effort' });
  const hard = effort.getByRole('radio', { name: 'Hard' });
  const nearFail = effort.getByRole('radio', { name: 'Near fail' });

  await hard.click();
  await expect(effort.locator('[tabindex="0"]')).toHaveCount(1);
  await expect(hard).toHaveAttribute('tabindex', '0');
  await hard.press('ArrowRight');
  await expect(nearFail).toHaveAttribute('aria-checked', 'true');
  await expect(nearFail).toBeFocused();
  await nearFail.press('ArrowLeft');
  await expect(hard).toHaveAttribute('aria-checked', 'true');
  await expect(hard).toBeFocused();
});

test('tapping the chosen effort again keeps it, and the set menu clears it', async ({ page }) => {
  await register(page, uniqueUsername('menu_effort'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'bench', BENCH);
  const row = setRow(card, 1);
  const hard = row.getByRole('radio', { name: 'Hard' });

  await hard.click();
  await expect(hard).toHaveAttribute('aria-checked', 'true');
  await hard.click();
  await expect(hard).toHaveAttribute('aria-checked', 'true');

  await openSetOptions(row, 1);
  await row.getByRole('button', { name: 'Clear effort set 1', exact: true }).click();
  await expect(hard).toHaveAttribute('aria-checked', 'false');
  await openSetOptions(row, 1);
  await expect(row.getByRole('button', { name: 'Clear effort set 1', exact: true })).toHaveCount(0);
});
