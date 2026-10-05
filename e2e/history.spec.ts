import { expect, test } from '@playwright/test';
import {
  finishedBenchDraft,
  finishWorkout,
  logExercise,
  logWorkout,
  openLatestWorkout,
  openTab,
  readSession,
  readStoredDraft,
  register,
  writeStoredDraft,
  xpValue,
} from './support/app.ts';
import { builtInExerciseId, editElsewhere, latestSetOf, sessionCount, sessionNotes, setsOf } from './support/db.ts';

test('edit a logged set from history, see the XP change, then delete the workout', async ({ page }) => {
  const username = `hist_${Date.now().toString(36)}`;
  await register(page, username);

  await logWorkout(page, () => logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]));

  await openTab(page, 'Log');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  const workouts = page.getByRole('list', { name: 'Workouts' }).getByRole('link');
  await expect(workouts).toHaveCount(1);
  await expect(workouts.first()).toContainText('Editable');
  await expect(workouts.first()).toContainText('1 set');
  await workouts.first().click();

  const sessionXp = page.getByRole('status', { name: 'Workout XP' });
  await expect(sessionXp).toHaveText(/^\+[\d,]+ XP$/);
  const xpBefore = xpValue(await sessionXp.textContent());

  const setRow = page.locator('li.set-row').first();
  await setRow.getByLabel('reps').fill('8');
  await setRow.getByRole('radio', { name: 'Failure' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect.poll(async () => xpValue(await sessionXp.textContent())).toBeGreaterThan(xpBefore);
  expect(await latestSetOf(username)).toMatchObject({ reps: 8, effort_input_type: 'level', effort_value: 0 });

  await page.getByRole('button', { name: 'Delete workout' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Workout deleted.')).toBeVisible();
  await expect(page.getByText('No workouts yet.', { exact: false })).toBeVisible();
  expect(await sessionCount(username)).toBe(0);
});

test('re-sending a workout that was deleted elsewhere shows it as deleted and drops the draft', async ({ page }) => {
  const username = `hist_del_${Date.now().toString(36)}`;
  await register(page, username);
  const { user } = await readSession(page);

  await logWorkout(page, () => logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]));

  await openLatestWorkout(page);
  const sessionId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Delete workout' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Workout deleted.')).toBeVisible();

  await writeStoredDraft(page, user.id, finishedBenchDraft(sessionId, await builtInExerciseId('barbell_bench_press')));
  await page.goto('/');
  await expect(page.getByText('This workout was deleted')).toBeVisible();
  await expect.poll(async () => (await readStoredDraft(page, user.id))?.kind).toBe('synced');
  expect(await sessionCount(username)).toBe(0);

  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(page.getByText('This workout was saved in another tab.')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
});

test('a save that races an edit from another device keeps both changes after review', async ({ page }) => {
  const username = `hist_rev_${Date.now().toString(36)}`;
  await register(page, username);
  await logWorkout(page, () => logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]));

  await openLatestWorkout(page);
  const sessionId = page.url().split('/').at(-1)!;

  await page.locator('li.set-row').first().getByRole('radio', { name: 'Failure' }).click();
  await editElsewhere(sessionId, 7);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Apply my changes to the latest version' }).click();

  const setRow = page.locator('li.set-row').first();
  await expect(setRow.getByLabel('reps')).toHaveValue('7');
  await expect(setRow.getByRole('radio', { name: 'Failure' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Notes')).toHaveValue('edited elsewhere');
  expect(await setsOf(sessionId)).toEqual([{ reps: 7, effort_input_type: 'level', effort_value: 3 }]);

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  expect(await setsOf(sessionId)).toEqual([{ reps: 7, effort_input_type: 'level', effort_value: 0 }]);
  expect(await sessionNotes(sessionId)).toBe('edited elsewhere');
});

test('rate the session when finishing, then see its length and RPE on the summary and in History', async ({ page }) => {
  await register(page, `hist_rpe_${Date.now().toString(36)}`);

  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  const sessionRpe = page.getByRole('combobox', { name: 'Session RPE (optional)' });
  await expect(sessionRpe).toHaveValue('');
  await sessionRpe.selectOption('8');
  await page.reload();
  await expect(sessionRpe).toHaveValue('8');
  await finishWorkout(page);

  await expect(page.getByText('<1 min · Session RPE 8')).toBeVisible();

  await openTab(page, 'Log');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  const workout = page.getByRole('list', { name: 'Workouts' }).getByRole('link').first();
  await expect(workout).toContainText('1 set · <1 min · Session RPE 8');
  await workout.click();
  await expect(page.getByRole('status', { name: 'Workout XP' })).toBeVisible();
  await expect(page.getByText('<1 min · Session RPE 8')).toBeVisible();
});
