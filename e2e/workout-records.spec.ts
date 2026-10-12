import { expect, test } from './support/fixtures.ts';
import {
  definitionOf,
  exactRepMaxes,
  exerciseCard,
  logCardio,
  logExercise,
  logWorkout,
  openTab,
  register,
  setRow,
  uniqueUsername,
} from './support/app.ts';

test('bodyweight prompt, live record chips, records and the collection log', async ({ page }) => {
  await register(page, `e2e_${Date.now().toString(36)}`);

  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [
    { weightKg: 60, reps: 5 },
    { weightKg: 60, reps: 5 },
  ]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 8 }, { reps: 8 }]);
  await expect(page.getByText(/New \d+RM!|Most reps!/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish workout' }).click();

  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect(page.getByLabel('New records')).toHaveCount(0);

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 70, reps: 5 }]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 10 }]);
  await expect(setRow(exerciseCard(page, 'Barbell Bench Press'), 1)).toContainText('New 5RM!');
  await expect(setRow(exerciseCard(page, 'Pull-up'), 1)).toContainText('Most reps!');
  await page.getByRole('button', { name: 'Finish workout' }).click();

  const records = page.getByLabel('New records');
  await expect(records).toContainText('Barbell Bench Press: 5RM 70 kg (was 60 kg)');
  await expect(records).toContainText('Pull-up: 10 reps (was 8)');

  await openTab(page, 'Collection');
  await expect(definitionOf(page, 'Completion')).toHaveText('18% (2/11)');
  const bench = exerciseCard(page, 'Barbell Bench Press');
  await expect(exactRepMaxes(bench)).toHaveText(['5RM 70 kg']);
  await expect(bench).toContainText('e1RM');
  const pullUp = exerciseCard(page, 'Pull-up');
  await expect(pullUp).toContainText(/Capacity ~\d+ reps/);
  await expect(pullUp).not.toContainText('e1RM');
});

test('cardio records on the reveal and in the collection log', async ({ page }) => {
  await register(page, uniqueUsername('cr'));
  for (const [minutes, distance] of [
    [30, 5],
    [36, 6],
  ]) {
    await openTab(page, 'Train');
    await logWorkout(page, () => logCardio(page, 'running', 'Running', [{ minutes, distance, effort: 'Moderate' }]));
  }
  await expect(page.getByLabel('New records')).toContainText('Running: 6 km (was 5 km) · 36 min (was 30 min)');

  await openTab(page, 'Collection');
  await expect(page.getByRole('region', { name: 'Cardio records' })).toContainText(
    'Distance 6 km · Pace 6:00 /km · Duration 36 min',
  );
  await expect(definitionOf(page, 'Completion')).toHaveText('0% (0/0)');
});
