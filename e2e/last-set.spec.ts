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
  return row.getByRole('spinbutton', { name: 'kg', exact: true });
}

function repsOf(row: Locator): Locator {
  return row.getByRole('spinbutton', { name: 'reps', exact: true });
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
  await bench.getByRole('button', { name: '+ Add set' }).click();
  await bench.getByRole('button', { name: '+ Add set' }).click();
  const first = setRow(bench, 1);
  const second = setRow(bench, 2);
  const third = setRow(bench, 3);

  await expect(first.getByRole('img', { name: 'Same as last time', exact: true })).toHaveText('= last');
  await expect(second.getByRole('img', { name: '2.5 kg less and 1 more rep than last time', exact: true })).toHaveText(
    '▼ −2.5 kg +1 rep',
  );
  await expect(third.getByRole('img', { name: /last time$/ })).toHaveCount(0);

  await second.getByRole('button', { name: 'Done set 2' }).click();
  const repeatSecond = second.getByRole('button', { name: 'Last time 62.5 kg × 4, fill set 2', exact: true });
  await expect(repeatSecond).toHaveText('Last 62.5×4');
  await expect(third.getByRole('button', { name: /^Last time/ })).toHaveCount(0);
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
