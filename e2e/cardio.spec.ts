import { expect, test } from './support/fixtures.ts';
import {
  boutRow,
  exerciseCard,
  logCardio,
  logExercise,
  logWorkout,
  openFromProfile,
  openLatestWorkout,
  openTab,
  register,
  uniqueUsername,
  xpValue,
} from './support/app.ts';
import { boutsOf } from './support/db.ts';

test('log a run, intervals and a lift in one workout, then edit the run distance from history', async ({ page }) => {
  const username = uniqueUsername('cd');
  await register(page, username);

  await page.getByRole('button', { name: 'Start workout' }).click();
  await logCardio(page, 'running', 'Running', [{ minutes: 30, distance: 5, effort: 'Moderate' }]);
  await logCardio(page, 'sprint', 'Sprint Intervals', [{ rounds: 10, workS: 30, restS: 30, effort: 'Hard' }]);
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await expect(boutRow(exerciseCard(page, 'Running'), 1).getByText(/^~[\d,]+$/)).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();

  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  const gains = page.getByRole('list', { name: 'XP gained' });
  await expect(gains).toContainText(/Endurance: \+[\d,]+ XP/);
  await expect(gains).toContainText(/Agility: \+[\d,]+ XP/);

  await openLatestWorkout(page);
  const sessionXp = page.getByRole('status', { name: 'Workout XP' });
  const xpBefore = xpValue(await sessionXp.textContent());
  const run = exerciseCard(page, 'Running');
  await expect(run.getByLabel('km', { exact: true })).toHaveValue('5');
  await run.getByLabel('km', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect.poll(async () => xpValue(await sessionXp.textContent())).toBeGreaterThan(xpBefore);

  const sessionId = page.url().split('/').at(-1)!;
  await expect
    .poll(() => boutsOf(sessionId))
    .toEqual([
      { duration_s: 1800, distance_m: 6000, interval_rounds: null, effort_value: 2 },
      { duration_s: 570, distance_m: null, interval_rounds: 10, effort_value: 3 },
    ]);
});

test('a pound user logs distance in miles', async ({ page }) => {
  const username = uniqueUsername('cdlb');
  await register(page, username);
  await openFromProfile(page, 'Settings');
  await page
    .getByRole('radiogroup', { name: 'Weight units' })
    .getByRole('radio', { name: 'Pounds', exact: true })
    .click();
  await openTab(page, 'Train');

  await logWorkout(page, () =>
    logCardio(page, 'running', 'Running', [{ minutes: 30, distance: 3.11, effort: 'Easy' }]),
  );

  await openLatestWorkout(page);
  const run = exerciseCard(page, 'Running');
  await expect(run.getByLabel('mi', { exact: true })).toHaveValue('3.11');
  const sessionId = page.url().split('/').at(-1)!;
  await expect
    .poll(() => boutsOf(sessionId))
    .toEqual([{ duration_s: 1800, distance_m: 5005.1, interval_rounds: null, effort_value: 1 }]);
});

test('log yoga without a distance field and earn Mobility', async ({ page }) => {
  await register(page, uniqueUsername('cdyoga'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logCardio(page, 'yoga', 'Yoga', [{ minutes: 20, effort: 'Moderate' }]);
  const bout = boutRow(exerciseCard(page, 'Yoga'), 1);
  await expect(bout.getByLabel('min', { exact: true })).toHaveValue('20');
  await expect(bout.getByLabel(/^(km|mi)$/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish workout' }).click();

  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'XP gained' })).toContainText(/Mobility: \+[\d,]+ XP/);
});
