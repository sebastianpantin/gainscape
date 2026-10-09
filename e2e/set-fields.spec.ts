import { expect, test } from '@playwright/test';
import { register, uniqueUsername } from './support/app.ts';

const BENCH = 'Barbell Bench Press';

test('weight and reps can be cleared and retyped, with a comma as the decimal separator', async ({ page }) => {
  await register(page, uniqueUsername('fields'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('bench');
  await page.getByRole('button', { name: new RegExp(`^${BENCH}\\b`) }).click();
  const row = page
    .locator('section', { has: page.getByRole('heading', { name: BENCH, exact: true }) })
    .locator('li.set-row')
    .first();
  const weight = row.getByRole('spinbutton', { name: 'kg', exact: true });
  const reps = row.getByRole('spinbutton', { name: 'reps', exact: true });

  await weight.fill('60');
  await weight.press('Control+A');
  await weight.press('Backspace');
  await expect(weight).toHaveValue('');
  await weight.pressSequentially('62,5');
  await expect(weight).toHaveValue('62,5');

  await reps.fill('8');
  await reps.press('Control+A');
  await reps.press('Backspace');
  await expect(reps).toHaveValue('');
  await reps.pressSequentially('10');
  await expect(reps).toHaveValue('10');

  await row.getByRole('button', { name: 'Done set 1' }).click();
  await expect(weight).toHaveValue('62.5');
  await expect(reps).toHaveValue('10');

  await page.getByRole('button', { name: 'Heavier, set 1' }).click();
  await expect(weight).toHaveValue('65');

  await reps.fill('');
  await row.getByRole('button', { name: 'One more rep, set 1' }).click();
  await expect(reps).toHaveValue('11');

  await page.reload();
  await expect(weight).toHaveValue('65');
  await expect(reps).toHaveValue('11');
});
