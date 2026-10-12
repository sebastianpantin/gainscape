import { expect, test } from './support/fixtures.ts';
import { addExercise, openSetOptions, register, setRow, uniqueUsername } from './support/app.ts';

const BENCH = 'Barbell Bench Press';

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
