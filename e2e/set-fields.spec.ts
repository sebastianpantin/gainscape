import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { shownUncovered } from './support/a11y.ts';
import { addExercise, exerciseCard, register, setRow, uniqueUsername } from './support/app.ts';

const BENCH = 'Barbell Bench Press';
const LONG_WORKOUT = [
  ['bench', BENCH],
  ['back squat', 'Back Squat'],
  ['deadlift', 'Deadlift'],
  ['barbell curl', 'Barbell Curl'],
  ['dumbbell curl', 'Dumbbell Curl'],
] as const;

async function scrollTopTo(page: Page, element: Locator, viewportY: number) {
  const box = await element.boundingBox();
  if (!box) throw new Error('No layout to scroll');
  await page.evaluate((by) => window.scrollBy(0, by), box.y - viewportY);
}

test('weight and reps can be cleared and retyped, with a comma as the decimal separator', async ({ page }) => {
  await register(page, uniqueUsername('fields'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const row = setRow(await addExercise(page, 'bench', BENCH), 1);
  const weight = row.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ });
  const reps = row.getByRole('spinbutton', { name: /^Reps, set \d+$/ });

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
  await reps.press('ArrowUp');
  await expect(reps).toHaveValue('11');

  await page.reload();
  await expect(weight).toHaveValue('65');
  await expect(reps).toHaveValue('11');

  await page.getByRole('button', { name: '+ Add set' }).click();
  const second = setRow(page, 2);
  await expect(second.getByRole('spinbutton', { name: 'Weight in kg, set 2', exact: true })).toHaveValue('65');
  await expect(second.getByRole('spinbutton', { name: 'Reps, set 2', exact: true })).toHaveValue('11');
});

test('a field flags text that is not the saved value and steps with the arrow keys', async ({ page }) => {
  await register(page, uniqueUsername('fields'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const row = setRow(await addExercise(page, 'bench', BENCH), 1);
  const weight = row.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ });
  const reps = row.getByRole('spinbutton', { name: /^Reps, set \d+$/ });

  await weight.fill('60');
  await expect(weight).not.toHaveAttribute('aria-invalid');
  await weight.fill('');
  await expect(weight).toHaveAttribute('aria-invalid', 'true');
  await expect(row.getByRole('status').filter({ hasText: 'Saved as' })).toHaveText('Saved as 60');
  await expect(weight).toHaveAccessibleDescription('Saved as 60');
  await weight.press('ArrowUp');
  await expect(weight).toHaveValue('62.5');
  await expect(weight).not.toHaveAttribute('aria-invalid');
  await expect(weight).toHaveAccessibleDescription('');
  await weight.press('ArrowDown');
  await weight.press('ArrowDown');
  await expect(weight).toHaveValue('57.5');

  await reps.fill('0');
  await expect(reps).toHaveAttribute('aria-invalid', 'true');
  await expect(row.getByRole('status').filter({ hasText: 'Saved as' })).toHaveText('Saved as 1');
  await expect(reps).toHaveAccessibleDescription('Saved as 1');
  await reps.press('Enter');
  await expect(reps).toBeFocused();
  await expect(reps).toHaveValue('1');
  await expect(reps).not.toHaveAttribute('aria-invalid');
  await expect(reps).toHaveAccessibleDescription('');
  await expect(row.getByRole('status').filter({ hasText: 'Saved as' })).toHaveCount(0);
  await reps.press('ArrowDown');
  await expect(reps).toHaveValue('1');
  await reps.press('ArrowUp');
  await expect(reps).toHaveValue('2');
});

test('focusing a filled field selects it, so typing replaces the value, and Enter moves on to reps, then Done', async ({
  page,
}) => {
  await register(page, uniqueUsername('fields'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const row = setRow(await addExercise(page, 'bench', BENCH), 1);
  const weight = row.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ });
  const reps = row.getByRole('spinbutton', { name: /^Reps, set \d+$/ });
  await expect(weight).toHaveAttribute('enterkeyhint', 'next');
  await expect(reps).toHaveAttribute('enterkeyhint', 'done');

  await weight.fill('80');
  await weight.blur();
  await weight.click();
  await weight.pressSequentially('85');
  await expect(weight).toHaveValue('85');

  await weight.press('Enter');
  await expect(reps).toBeFocused();
  await reps.pressSequentially('6');
  await expect(reps).toHaveValue('6');
  await reps.press('Enter');
  await expect(row.getByRole('button', { name: 'Done set 1', exact: true })).toBeFocused();
  await expect(reps).toHaveValue('6');

  await reps.click();
  await reps.press('ArrowRight');
  await reps.pressSequentially('0');
  await expect(reps).toHaveValue('60');
});

test('far down a long workout the clock stays in view, and focusing a reps field never leaves it under the bar', async ({
  page,
}) => {
  await register(page, uniqueUsername('sticky'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  for (const [search, name] of LONG_WORKOUT) await addExercise(page, search, name);
  const clock = page.getByRole('timer', { name: /^Elapsed / });
  const finish = page.getByRole('button', { name: 'Finish workout' });

  await scrollTopTo(page, exerciseCard(page, 'Dumbbell Curl'), 0);
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).not.toBeInViewport();
  await expect(clock).toBeInViewport({ ratio: 1 });
  expect(await shownUncovered(clock)).toBe(true);
  expect(await shownUncovered(finish)).toBe(true);

  const reps = setRow(exerciseCard(page, 'Deadlift'), 1).getByRole('spinbutton', { name: /^Reps, set \d+$/ });
  await reps.evaluate((field) => field.scrollIntoView({ block: 'start' }));
  await reps.focus();
  await expect.poll(() => shownUncovered(reps)).toBe(true);

  const behindBar = setRow(exerciseCard(page, 'Back Squat'), 1).getByRole('spinbutton', { name: /^Reps, set \d+$/ });
  const barTop = (await clock.boundingBox())?.y;
  if (barTop === undefined) throw new Error('No clock box');
  await scrollTopTo(page, behindBar, barTop + 8);
  expect(await shownUncovered(behindBar)).toBe(false);
  await behindBar.focus();
  await expect.poll(() => shownUncovered(behindBar)).toBe(true);
  const fieldBox = await behindBar.boundingBox();
  if (!fieldBox) throw new Error('No field box after focus');
  expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(barTop);
});

test('the next set to do is marked as the current step, past a skipped set', async ({ page }) => {
  await register(page, uniqueUsername('fields'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'bench', BENCH);
  await page.getByRole('button', { name: '+ Add set' }).click();
  await page.getByRole('button', { name: '+ Add set' }).click();
  const [first, second, third] = [setRow(card, 1), setRow(card, 2), setRow(card, 3)];
  const current = card.locator('[aria-current="step"]');
  await expect(first).toHaveAttribute('aria-current', 'step');
  await expect(current).toHaveCount(1);

  await second.getByRole('button', { name: 'Done set 2' }).click();
  await expect(third).toHaveAttribute('aria-current', 'step');
  await expect(current).toHaveCount(1);

  await third.getByRole('button', { name: 'Done set 3' }).click();
  await expect(first).toHaveAttribute('aria-current', 'step');

  await first.getByRole('button', { name: 'Done set 1' }).click();
  await expect(current).toHaveCount(0);
});
