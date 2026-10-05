import { expect, type Locator, type Page, test } from '@playwright/test';
import { finishWorkout, logExercise, openFromProfile, openTab, register, uniqueUsername } from './support/app.ts';
import { warmupFlagsOfLatestSession } from './support/db.ts';

function exerciseCard(page: Page, name: string): Locator {
  return page.locator('section', { has: page.getByRole('heading', { name, exact: true }) });
}

async function addExercise(page: Page, search: string, name: string): Promise<Locator> {
  await page.getByLabel('Search exercises').fill(search);
  await page.getByRole('button', { name: new RegExp(`^${name}\\b`) }).click();
  return exerciseCard(page, name);
}

function weightOf(row: Locator): Locator {
  return row.getByRole('spinbutton', { name: 'kg', exact: true });
}

test('a set flagged as a warm-up is stored as a warm-up and earns no XP', async ({ page }) => {
  const username = uniqueUsername('wu');
  await register(page, username);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [
    { weightKg: 40, reps: 8 },
    { weightKg: 60, reps: 5 },
  ]);
  const warmup = exerciseCard(page, 'Barbell Bench Press').getByRole('listitem').first();
  const toggle = warmup.getByRole('button', { name: 'Warm-up set 1', exact: true });
  const restTimer = page.getByRole('region', { name: 'Rest timer' });
  await warmup.getByRole('button', { name: 'Done set 1' }).click();
  await warmup.getByRole('button', { name: 'Done set 1' }).click();
  await expect(restTimer).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(restTimer).toHaveCount(0);
  await expect(warmup.getByText('warm-up', { exact: true })).toBeVisible();

  await finishWorkout(page);
  const stored = await warmupFlagsOfLatestSession(username);
  expect(stored.map((set) => set.is_warmup)).toEqual([true, false]);
  expect(stored[0].xp_awarded).toBe(0);
  expect(stored[1].xp_awarded).toBeGreaterThan(0);
});

test('warm-ups ramp from the bar to the first working set of a barbell lift', async ({ page }) => {
  await register(page, uniqueUsername('wg'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const squat = await addExercise(page, 'squat', 'Back Squat');
  await weightOf(squat.getByRole('listitem').first()).fill('100');

  await squat.getByRole('button', { name: '+ Add warm-ups', exact: true }).click();
  const rows = squat.getByRole('listitem');
  await expect(rows).toHaveCount(5);
  for (const [index, [weight, reps]] of [
    ['20', '10'],
    ['40', '5'],
    ['60', '3'],
    ['80', '2'],
  ].entries()) {
    const row = rows.nth(index);
    await expect(weightOf(row), `warm-up ${index + 1} weight`).toHaveValue(weight);
    await expect(row.getByRole('spinbutton', { name: 'reps', exact: true })).toHaveValue(reps);
    await expect(row.getByRole('button', { name: `Warm-up set ${index + 1}` })).toHaveAttribute('aria-pressed', 'true');
    await expect(row.getByRole('button', { name: `Done set ${index + 1}` })).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(weightOf(rows.nth(4))).toHaveValue('100');
  await expect(squat.getByRole('button', { name: '+ Add warm-ups' })).toHaveCount(0);

  const curl = await addExercise(page, 'curl', 'Dumbbell Curl');
  await expect(curl.getByRole('button', { name: '+ Add warm-ups' })).toHaveCount(0);
});

test('a freestyle barbell set shows plates per side with the plates set on this device', async ({ page }) => {
  await register(page, uniqueUsername('pl'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const squat = await addExercise(page, 'squat', 'Back Squat');
  const firstSet = squat.getByRole('listitem').first();
  await expect(firstSet.getByText('Empty bar', { exact: true })).toBeVisible();
  await weightOf(firstSet).fill('100');
  await expect(firstSet.getByText('25 + 15 per side', { exact: true })).toBeVisible();
  const curl = await addExercise(page, 'curl', 'Dumbbell Curl');
  await expect(curl.getByText(/per side|Empty bar/)).toHaveCount(0);

  await openFromProfile(page, 'Settings');
  const plates = page.getByRole('group', { name: 'Plates you have (kg)' });
  for (const plate of ['25', '15']) {
    await plates.getByRole('button', { name: plate, exact: true }).click();
    await expect(plates.getByRole('button', { name: plate, exact: true })).toHaveAttribute('aria-pressed', 'false');
  }
  const bar = page.getByRole('spinbutton', { name: 'Bar weight (kg)' });
  await bar.fill('0');
  await expect(bar).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Enter a bar weight above 0 and up to 100 kg. Using 20 kg.')).toBeVisible();
  await bar.fill('15');
  await expect(bar).toHaveAttribute('aria-invalid', 'false');

  await openTab(page, 'Train');
  await expect(firstSet.getByText('20 + 20 + 2.5 per side', { exact: true })).toBeVisible();
  await weightOf(firstSet).fill('101');
  await expect(firstSet.getByText('Nearest 100 kg: 20 + 20 + 2.5 per side', { exact: true })).toBeVisible();
});

test('the plate calculator of a set breaks a target weight into plates and uses the nearest loadable weight', async ({
  page,
}) => {
  await register(page, uniqueUsername('pc'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const squat = await addExercise(page, 'squat', 'Back Squat');
  const firstSet = squat.getByRole('listitem').first();

  await firstSet.getByText('Empty bar', { exact: true }).click();
  const calculator = firstSet.getByRole('group', { name: 'Plate calculator, set 1' });
  const target = calculator.getByRole('spinbutton', { name: 'Target kg' });
  await target.fill('5000');
  await expect(calculator.getByRole('status')).toHaveText('Enter a weight up to 2000 kg');
  await expect(calculator.getByRole('button', { name: /^Use / })).toHaveCount(0);
  await target.fill('61');
  await expect(calculator.getByRole('status')).toHaveText('Nearest 60 kg: 20 per side');
  await calculator.getByRole('button', { name: 'Use 60 kg', exact: true }).click();
  await expect(weightOf(firstSet)).toHaveValue('60');
  await expect(firstSet.getByText('20 per side', { exact: true })).toBeVisible();
  await expect(calculator.getByRole('button', { name: 'Use 60 kg', exact: true })).toBeDisabled();
});
