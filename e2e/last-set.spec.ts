import { type Locator } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  addExercise,
  logExercise,
  logWorkout,
  openSetOptions,
  openTab,
  register,
  setRow,
  uniqueUsername,
} from './support/app.ts';

function weightOf(row: Locator): Locator {
  return row.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ });
}

function repsOf(row: Locator): Locator {
  return row.getByRole('spinbutton', { name: /^Reps, set \d+$/ });
}

test('each set compares with last session’s set and a planned set fills it in one tap', async ({ page }) => {
  await register(page, uniqueUsername('ls'));
  await logWorkout(page, () =>
    logExercise(page, 'bench', 'Barbell Bench Press', [
      { weightKg: 60, reps: 5 },
      { weightKg: 62.5, reps: 4 },
    ]),
  );

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  const bench = await addExercise(page, 'bench', 'Barbell Bench Press');
  const first = setRow(bench, 1);
  const second = setRow(bench, 2);
  const third = setRow(bench, 3);
  const doneFirst = first.getByRole('button', { name: 'Done set 1' });
  await expect(doneFirst).toHaveAttribute('aria-pressed', 'false');
  await expect(first.getByRole('button', { name: 'Last time 60 kg × 5, fill set 1', exact: true })).toHaveText(
    'Last 60×5',
  );
  await doneFirst.click();
  await expect(first.getByRole('img', { name: 'Same as last time', exact: true })).toHaveText('= last');
  await bench.getByRole('button', { name: '+ Add set' }).click();
  await bench.getByRole('button', { name: '+ Add set' }).click();

  const repeatSecond = second.getByRole('button', { name: 'Last time 62.5 kg × 4, fill set 2', exact: true });
  await expect(repeatSecond).toHaveText('Last 62.5×4');
  await expect(third.getByRole('button', { name: /^Last time/ })).toHaveCount(0);
  await second.getByRole('button', { name: 'Done set 2' }).click();
  await expect(second.getByRole('img', { name: '2.5 kg less and 1 more rep than last time', exact: true })).toHaveText(
    '▼ −2.5 kg +1 rep',
  );
  await expect(third.getByRole('img', { name: /last time$/ })).toHaveCount(0);

  await second.getByRole('button', { name: 'Done set 2' }).click();
  await repeatSecond.click();
  await expect(weightOf(second)).toHaveValue('62.5');
  await expect(repsOf(second)).toHaveValue('4');
  await expect(second.getByRole('button', { name: 'Done set 2' })).toHaveAttribute('aria-pressed', 'false');

  await weightOf(first).fill('62.5');
  await expect(first.getByRole('img', { name: '2.5 kg more than last time', exact: true })).toHaveText('▲ +2.5 kg');

  await openSetOptions(first, 1);
  await first.getByRole('button', { name: 'Warm-up set 1', exact: true }).click();
  await expect(first.getByRole('img', { name: /last time$/ })).toHaveCount(0);
  await expect(second.getByRole('button', { name: 'Last time 60 kg × 5, fill set 2', exact: true })).toHaveText(
    'Last 60×5',
  );
});

test.describe('on a 360x740 phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('a rated top set offers a back-off weight on the next set that fills in one tap', async ({ page }) => {
    await register(page, uniqueUsername('bo'));
    await page.getByRole('button', { name: 'Start workout' }).click();
    const bench = await addExercise(page, 'bench', 'Barbell Bench Press');
    const first = setRow(bench, 1);
    const second = setRow(bench, 2);
    await weightOf(first).fill('100');
    await repsOf(first).fill('3');
    await first.getByRole('radio', { name: 'Near fail', exact: true }).click();
    await first.getByRole('button', { name: 'Done set 1' }).click();
    await bench.getByRole('button', { name: '+ Add set' }).click();

    const backoff = second.getByRole('button', { name: /^Back-off/ });
    await expect(backoff).toHaveAccessibleName('Back-off 95 kg × 3, fill set 2');
    await expect(backoff).toHaveText('Back-off 95 kg × 3');
    await expect(second.getByRole('button', { name: /^Last time/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await backoff.click();
    await expect(weightOf(second)).toHaveValue('95');
    await expect(repsOf(second)).toHaveValue('3');
    await expect(second.getByRole('button', { name: /^Back-off/ })).toHaveCount(0);
    await expect(first.getByRole('button', { name: /^Back-off/ })).toHaveCount(0);
  });
});
