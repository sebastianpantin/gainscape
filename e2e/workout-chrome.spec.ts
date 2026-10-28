import { type Locator } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  addExercise,
  exerciseCard,
  logExercise,
  openSetOptions,
  register,
  restTimer,
  setRow,
  uniqueUsername,
} from './support/app.ts';

const MOST_FIXED_CHROME_PX = 150;
const LEAST_DONE_MENU_GAP_PX = 8;

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'element has a layout box').not.toBeNull();
  return box!;
}

test.describe('on a 360x740 phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the finish bar keeps the rest timer and Finish on one row above the tab bar', async ({ page }) => {
    await register(page, uniqueUsername('chrome_bar'));
    await page.getByRole('button', { name: 'Start workout' }).click();
    await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
    await expect(restTimer(page).getByRole('timer', { name: 'Rest remaining' })).toBeVisible();

    const finishBar = await boxOf(page.locator('.finish-bar'));
    const tabBar = await boxOf(page.getByRole('navigation', { name: 'Main' }));
    expect(finishBar.height + tabBar.height).toBeLessThanOrEqual(MOST_FIXED_CHROME_PX);

    const timer = await boxOf(restTimer(page));
    const finish = await boxOf(page.getByRole('button', { name: 'Finish workout' }));
    expect(finish.y).toBeLessThan(timer.y + timer.height);
    expect(finish.y + finish.height).toBeGreaterThan(timer.y);
  });

  test('Done and the set menu sit at least 8px apart', async ({ page }) => {
    await register(page, uniqueUsername('chrome_gap'));
    await page.getByRole('button', { name: 'Start workout' }).click();
    await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
    const row = setRow(exerciseCard(page, 'Barbell Bench Press'), 1);

    const done = await boxOf(row.getByRole('button', { name: 'Done set 1', exact: true }));
    const menu = await boxOf(row.getByRole('button', { name: 'Set 1 options', exact: true }));
    const verticalGap = Math.max(menu.y - (done.y + done.height), done.y - (menu.y + menu.height));
    const horizontalGap = Math.max(menu.x - (done.x + done.width), done.x - (menu.x + menu.width));
    expect(Math.max(verticalGap, horizontalGap)).toBeGreaterThanOrEqual(LEAST_DONE_MENU_GAP_PX);
  });
});

test('the undo toast sits clear of the finish bar while a rest runs', async ({ page }) => {
  const bench = 'Barbell Bench Press';
  await register(page, uniqueUsername('chrome_toast'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', bench, [
    { weightKg: 60, reps: 5 },
    { weightKg: 60, reps: 5 },
  ]);
  await expect(restTimer(page).getByRole('timer', { name: 'Rest remaining' })).toBeVisible();

  const row = setRow(exerciseCard(page, bench), 2);
  await openSetOptions(row, 2);
  await row.getByRole('button', { name: 'Remove set 2', exact: true }).click();
  const toast = page.getByRole('status').filter({ hasText: `Removed set 2 of ${bench}.` });
  await expect(toast).toBeVisible();

  const toastBox = await boxOf(toast);
  const finishBar = await boxOf(page.locator('.finish-bar'));
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(finishBar.y);
});

for (const viewport of [
  { width: 390, height: 664 },
  { width: 360, height: 740 },
]) {
  test.describe(`on a ${viewport.width}x${viewport.height} phone`, () => {
    test.use({ viewport });

    test('each set Done leaves that set effort chips above the finish bar', async ({ page }) => {
      const bench = 'Barbell Bench Press';
      await register(page, uniqueUsername('chrome_effort'));
      await page.getByRole('button', { name: 'Start workout' }).click();
      const card = await addExercise(page, 'bench', bench);
      for (let added = 1; added < 4; added++) await card.getByRole('button', { name: '+ Add set' }).click();

      for (let setNumber = 1; setNumber <= 4; setNumber++) {
        const row = setRow(card, setNumber);
        await row.getByRole('button', { name: `Done set ${setNumber}`, exact: true }).click();
        await expect(restTimer(page).getByRole('timer', { name: 'Rest remaining' })).toBeVisible();
        const effort = row.getByRole('radiogroup', { name: 'Effort' });
        await expect
          .poll(async () => {
            const chips = await boxOf(effort);
            const finishBar = await boxOf(page.locator('.finish-bar'));
            return finishBar.y - (chips.y + chips.height);
          }, `set ${setNumber} effort chips clear the finish bar`)
          .toBeGreaterThanOrEqual(0);
      }
    });
  });
}
