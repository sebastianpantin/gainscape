import { type Locator } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { addExercise, openSetOptions, register, setRow, setRows, uniqueUsername } from './support/app.ts';

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
