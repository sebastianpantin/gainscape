import { type Locator } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  addExercise,
  exerciseCard,
  finishWorkout,
  logExercise,
  openFromProfile,
  openSetOptions,
  openTab,
  register,
  setRow,
  setRows,
  uniqueUsername,
  warmupBadge,
} from './support/app.ts';
import { warmupFlagsOfLatestSession } from './support/db.ts';

function weightOf(row: Locator): Locator {
  return row.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ });
}

test('a set flagged as a warm-up is stored as a warm-up and earns no XP', async ({ page }) => {
  const username = uniqueUsername('wu');
  await register(page, username);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [
    { weightKg: 40, reps: 8 },
    { weightKg: 60, reps: 5 },
  ]);
  const warmup = setRow(exerciseCard(page, 'Barbell Bench Press'), 1);
  const restTimer = page.getByRole('region', { name: 'Rest timer' });
  await warmup.getByRole('button', { name: 'Done set 1' }).click();
  await warmup.getByRole('button', { name: 'Done set 1' }).click();
  await expect(restTimer).toBeVisible();
  await openSetOptions(warmup, 1);
  const toggle = warmup.getByRole('button', { name: 'Warm-up set 1', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toBeHidden();
  await expect(warmupBadge(warmup)).toBeVisible();
  await openSetOptions(warmup, 1);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeHidden();
  await expect(restTimer).toHaveCount(0);
  await expect(warmup.getByText('warm-up', { exact: true })).toBeVisible();

  await finishWorkout(page);
  await expect
    .poll(async () => (await warmupFlagsOfLatestSession(username)).map((set) => set.is_warmup))
    .toEqual([true, false]);
  const stored = await warmupFlagsOfLatestSession(username);
  expect(stored[0].xp_awarded).toBe(0);
  expect(stored[1].xp_awarded).toBeGreaterThan(0);
});

test('warm-ups ramp from the bar to the first working set of a barbell lift', async ({ page }) => {
  await register(page, uniqueUsername('wg'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const squat = await addExercise(page, 'squat', 'Back Squat');
  await weightOf(setRow(squat, 1)).fill('100');

  await squat.getByRole('button', { name: '+ Add warm-ups', exact: true }).click();
  const rows = setRows(squat);
  await expect(rows).toHaveCount(5);
  for (const [index, [weight, reps]] of [
    ['20', '10'],
    ['40', '5'],
    ['60', '3'],
    ['80', '2'],
  ].entries()) {
    const row = setRow(squat, index + 1);
    await expect(weightOf(row), `warm-up ${index + 1} weight`).toHaveValue(weight);
    await expect(row.getByRole('spinbutton', { name: /^Reps, set \d+$/ })).toHaveValue(reps);
    await expect(warmupBadge(row), `warm-up ${index + 1} flag`).toBeVisible();
    await expect(row.getByRole('button', { name: `Done set ${index + 1}` })).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(weightOf(setRow(squat, 5))).toHaveValue('100');
  await expect(squat.getByRole('button', { name: '+ Add warm-ups' })).toHaveCount(0);
});

test('a lift with no ramp to build still offers one warm-up set to edit', async ({ page }) => {
  await register(page, uniqueUsername('wu'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const squat = await addExercise(page, 'squat', 'Back Squat');
  await weightOf(setRow(squat, 1)).fill('20');
  await squat.getByRole('button', { name: '+ Add warm-ups', exact: true }).click();
  await expect(setRows(squat)).toHaveCount(2);
  await expect(weightOf(setRow(squat, 1))).toHaveValue('20');
  await expect(warmupBadge(setRow(squat, 1))).toBeVisible();

  const pullUp = await addExercise(page, 'pull-up', 'Pull-up');
  const reps = (row: Locator) => row.getByRole('spinbutton', { name: /^Reps, set \d+$/ });
  await reps(setRow(pullUp, 1)).fill('8');
  await pullUp.getByRole('button', { name: '+ Add warm-ups', exact: true }).click();
  await expect(setRows(pullUp)).toHaveCount(2);
  await expect(reps(setRow(pullUp, 1))).toHaveValue('8');
  await expect(warmupBadge(setRow(pullUp, 1))).toBeVisible();
  await expect(warmupBadge(setRow(pullUp, 2))).toHaveCount(0);
  await expect(pullUp.getByRole('button', { name: '+ Add warm-ups' })).toHaveCount(0);
});

test('warm-ups ramp a dumbbell lift in load steps with no bar step', async ({ page }) => {
  await register(page, uniqueUsername('wd'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const curl = await addExercise(page, 'dumbbell curl', 'Dumbbell Curl');
  await weightOf(setRow(curl, 1)).fill('30');

  await curl.getByRole('button', { name: '+ Add warm-ups', exact: true }).click();
  await expect(setRows(curl)).toHaveCount(4);
  for (const [index, [weight, reps]] of [
    ['12.5', '5'],
    ['17.5', '3'],
    ['25', '2'],
  ].entries()) {
    const row = setRow(curl, index + 1);
    await expect(weightOf(row), `warm-up ${index + 1} weight`).toHaveValue(weight);
    await expect(row.getByRole('spinbutton', { name: /^Reps, set \d+$/ })).toHaveValue(reps);
    await expect(warmupBadge(row), `warm-up ${index + 1} flag`).toBeVisible();
  }
  await expect(weightOf(setRow(curl, 4))).toHaveValue('30');
  await expect(warmupBadge(setRow(curl, 4))).toHaveCount(0);
});

test('a freestyle barbell set shows plates per side with the plates set on this device', async ({ page }) => {
  await register(page, uniqueUsername('pl'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const squat = await addExercise(page, 'squat', 'Back Squat');
  const firstSet = setRow(squat, 1);
  await expect(firstSet.getByText('Empty bar', { exact: true })).toBeVisible();
  await weightOf(firstSet).fill('100');
  await expect(firstSet.getByText('25 + 15 kg each side', { exact: true })).toBeVisible();
  await expect(firstSet.getByRole('img', { name: '2 plates each side', exact: true })).toBeVisible();
  const curl = await addExercise(page, 'dumbbell curl', 'Dumbbell Curl');
  await expect(curl.getByText(/each side|Empty bar/)).toHaveCount(0);

  await openFromProfile(page, 'Settings');
  const plates = page.getByRole('group', { name: 'Plates you have (kg)' });
  for (const plate of ['25', '15']) {
    await plates.getByRole('button', { name: plate, exact: true }).click();
    await expect(plates.getByRole('button', { name: plate, exact: true })).toHaveAttribute('aria-pressed', 'false');
  }
  const bar = page.getByRole('textbox', { name: 'Bar weight (kg)' });
  await bar.fill('0');
  await expect(bar).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Enter a bar weight above 0 and up to 100 kg. Using 20 kg.')).toBeVisible();
  await bar.fill('17,5');
  await expect(bar).toHaveAttribute('aria-invalid', 'false');
  await bar.fill('15');
  await expect(bar).toHaveAttribute('aria-invalid', 'false');

  await openTab(page, 'Train');
  await expect(firstSet.getByText('2×20 + 2.5 kg each side', { exact: true })).toBeVisible();
  await weightOf(firstSet).fill('101');
  await expect(firstSet.getByText('Nearest 100 kg: 2×20 + 2.5 kg each side', { exact: true })).toBeVisible();
});

test('the plate calculator of a set breaks a target weight into plates and uses the nearest loadable weight', async ({
  page,
}) => {
  await register(page, uniqueUsername('pc'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const squat = await addExercise(page, 'squat', 'Back Squat');
  const firstSet = setRow(squat, 1);

  await firstSet.getByText('Empty bar', { exact: true }).click();
  const calculator = firstSet.getByRole('group', { name: 'Plate calculator, set 1' });
  const target = calculator.getByRole('spinbutton', { name: 'Target kg' });
  await target.fill('5000');
  await expect(calculator.getByRole('status')).toHaveText('Enter a weight up to 2000 kg');
  await expect(calculator.getByRole('button', { name: /^Use / })).toHaveCount(0);
  await target.fill('61');
  await expect(calculator.getByRole('status')).toHaveText('Nearest 60 kg: 20 kg each side');
  await calculator.getByRole('button', { name: 'Use 60 kg', exact: true }).click();
  await expect(weightOf(firstSet)).toHaveValue('60');
  await expect(firstSet.getByText('20 kg each side', { exact: true })).toBeVisible();
  await expect(calculator.getByRole('button', { name: 'Use 60 kg', exact: true })).toBeDisabled();
});
