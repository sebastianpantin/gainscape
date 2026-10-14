import { expect, test } from './support/fixtures.ts';
import {
  finishedBenchDraft,
  finishWorkout,
  logBench,
  logExercise,
  openLatestWorkout,
  openSetOptions,
  openTab,
  readSession,
  readStoredDraft,
  register,
  setRow,
  uniqueUsername,
  writeStoredDraft,
  xpValue,
} from './support/app.ts';
import {
  backdateSessions,
  builtInExerciseId,
  editElsewhere,
  latestSetOf,
  seedWorkouts,
  sessionCount,
  sessionNotes,
  setsOf,
} from './support/db.ts';

test('edit a logged set from history, see the XP change, then delete the workout', async ({ page }) => {
  const username = `hist_${Date.now().toString(36)}`;
  await register(page, username);

  await logBench(page);

  await openTab(page, 'Collection');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  const workouts = page.getByRole('list', { name: 'Workouts' }).getByRole('link');
  await expect(workouts).toHaveCount(1);
  await expect(workouts.first()).toContainText('Editable');
  await expect(workouts.first()).toContainText('1 set');
  await expect(workouts.first()).toContainText('Barbell Bench Press');
  await expect(workouts.first()).toContainText('300 kg volume');
  await expect(page.getByText('You can change or delete workouts from the last 7 days.')).toBeVisible();
  await workouts.first().click();

  const sessionXp = page.getByRole('status', { name: 'Workout XP' });
  await expect(sessionXp).toHaveText(/^\+[\d,]+ XP$/);
  const xpBefore = xpValue(await sessionXp.textContent());

  const firstSet = setRow(page, 1);
  await firstSet.getByLabel('reps', { exact: true }).fill('8');
  await firstSet.getByRole('radio', { name: 'Failure' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect.poll(async () => xpValue(await sessionXp.textContent())).toBeGreaterThan(xpBefore);
  await expect
    .poll(() => latestSetOf(username))
    .toMatchObject({ reps: 8, effort_input_type: 'level', effort_value: 0 });

  await page.getByRole('button', { name: 'Delete workout' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Workout deleted.')).toBeVisible();
  await expect(page.getByText('No workouts yet.', { exact: false })).toBeVisible();
  await expect.poll(() => sessionCount(username)).toBe(0);
});

test('a warm-up set keeps its warm-up cue in the session detail, editable or locked', async ({ page }) => {
  const username = uniqueUsername('hw');
  await register(page, username);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [
    { weightKg: 40, reps: 8 },
    { weightKg: 60, reps: 5 },
  ]);
  const warmup = setRow(page, 1);
  await openSetOptions(warmup, 1);
  await warmup.getByRole('button', { name: 'Warm-up set 1', exact: true }).click();
  await finishWorkout(page);

  await openLatestWorkout(page);
  await expect(page.getByRole('button', { name: 'Warm-up set 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Warm-up set 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await backdateSessions(username, 8);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  const warmupRows = page.getByRole('main').getByRole('listitem').filter({ hasText: '· warm-up' });
  await expect(warmupRows).toHaveCount(1);
  await expect(warmupRows).toContainText('40 kg × 8');
});

test('a workout older than the edit window shows as locked in History', async ({ page }) => {
  const username = uniqueUsername('hist_lock');
  await register(page, username);
  await logBench(page);
  await backdateSessions(username, 10);

  await openTab(page, 'Collection');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  const workout = page.getByRole('list', { name: 'Workouts' }).getByRole('link').first();
  await expect(workout).toContainText('Locked');
  await expect(workout).not.toContainText('Editable');
});

test('Back from an older workout keeps every loaded page of History and its scroll position', async ({ page }) => {
  const username = uniqueUsername('hist_back');
  await register(page, username);
  await seedWorkouts(username, 55);
  await openTab(page, 'Collection');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  const workouts = page.getByRole('list', { name: 'Workouts' }).getByRole('link');
  await expect(workouts).toHaveCount(50);
  await workouts.last().scrollIntoViewIfNeeded();
  await expect(workouts).toHaveCount(55);

  const olderWorkout = workouts.nth(52);
  await olderWorkout.scrollIntoViewIfNeeded();
  const scrolledTo = await page.evaluate(() => window.scrollY);
  expect(scrolledTo).toBeGreaterThan(0);
  await olderWorkout.click();
  await expect(page).toHaveURL(/\/collection\/history\/[0-9a-f-]+$/);
  await expect(page.getByRole('link', { name: '← History' })).toBeVisible();

  await page.goBack();

  await expect(workouts).toHaveCount(55);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrolledTo);
  await expect(olderWorkout).toBeInViewport();
});

test('the Progress link waits until edits are saved, so leaving for progress cannot drop them', async ({ page }) => {
  await register(page, uniqueUsername('hist_prog'));
  await logBench(page);
  await openLatestWorkout(page);
  const progress = page.getByRole('link', { name: 'Barbell Bench Press progress' });
  await expect(progress).toBeVisible();

  await setRow(page, 1).getByLabel('reps', { exact: true }).fill('8');
  await expect(progress).toHaveCount(0);

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect(progress).toBeVisible();
});

test('re-sending a workout that was deleted elsewhere shows it as deleted and drops the draft', async ({ page }) => {
  const username = `hist_del_${Date.now().toString(36)}`;
  await register(page, username);
  const { user } = await readSession(page);

  await logBench(page);

  await openLatestWorkout(page);
  const sessionId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Delete workout' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Workout deleted.')).toBeVisible();

  await writeStoredDraft(page, user.id, finishedBenchDraft(sessionId, await builtInExerciseId('barbell_bench_press')));
  await page.goto('/');
  await expect(page.getByText('This workout was deleted')).toBeVisible();
  await expect.poll(async () => (await readStoredDraft(page, user.id))?.kind).toBe('synced');
  await expect.poll(() => sessionCount(username)).toBe(0);

  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(page.getByText('This workout was saved in another tab.')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
});

test('re-finishing a workout that was already saved shows the summary and says this copy was not applied', async ({
  page,
}) => {
  const username = `hist_resend_${Date.now().toString(36)}`;
  await register(page, username);
  const { user } = await readSession(page);

  await logBench(page);
  await openLatestWorkout(page);
  const sessionId = page.url().split('/').at(-1)!;
  const storedSets = await setsOf(sessionId);

  await writeStoredDraft(page, user.id, finishedBenchDraft(sessionId, await builtInExerciseId('barbell_bench_press')));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: "differs from this device's copy, so this copy was not applied" }),
  ).toBeVisible();
  await expect.poll(async () => (await readStoredDraft(page, user.id))?.kind).toBe('synced');
  await expect.poll(() => sessionCount(username)).toBe(1);
  await expect.poll(() => setsOf(sessionId)).toEqual(storedSets);

  await page.getByRole('link', { name: 'Open this workout' }).click();
  await expect(page).toHaveURL(new RegExp(`/collection/history/${sessionId}$`));
});

test('a save that races an edit from another device keeps both changes after review', async ({ page }) => {
  const username = `hist_rev_${Date.now().toString(36)}`;
  await register(page, username);
  await logBench(page);

  await openLatestWorkout(page);
  const sessionId = page.url().split('/').at(-1)!;

  await setRow(page, 1).getByRole('radio', { name: 'Failure' }).click();
  await editElsewhere(sessionId, 7);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Apply my changes to the latest version' }).click();

  const firstSet = setRow(page, 1);
  await expect(firstSet.getByLabel('reps', { exact: true })).toHaveValue('7');
  await expect(firstSet.getByRole('radio', { name: 'Failure' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Notes')).toHaveValue('edited elsewhere');
  await expect.poll(() => setsOf(sessionId)).toEqual([{ reps: 7, effort_input_type: 'level', effort_value: 3 }]);

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect.poll(() => setsOf(sessionId)).toEqual([{ reps: 7, effort_input_type: 'level', effort_value: 0 }]);
  await expect.poll(() => sessionNotes(sessionId)).toBe('edited elsewhere');
});

test('a save whose refresh fails keeps the saved sets as the baseline, so undo cannot write old values back', async ({
  page,
}) => {
  const username = uniqueUsername('hist_ref');
  await register(page, username);
  await logBench(page);

  await openLatestWorkout(page);
  const sessionId = page.url().split('/').at(-1)!;
  const sessionReads = /\/rest\/v1\/sessions\?/;

  await setRow(page, 1).getByLabel('reps', { exact: true }).fill('8');
  await page.route(sessionReads, (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('alert')).toContainText("Saved, but couldn't refresh the workout.", {
    timeout: 15_000,
  });
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Undo my changes' })).toHaveCount(0);
  await expect.poll(async () => (await setsOf(sessionId)).map((set) => set.reps)).toEqual([8]);

  await page.unroute(sessionReads);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect(setRow(page, 1).getByLabel('reps', { exact: true })).toHaveValue('8');
});

test('a delete that races an edit from another device shows the latest version before deleting', async ({ page }) => {
  const username = `hist_delrev_${Date.now().toString(36)}`;
  await register(page, username);
  await logBench(page);

  await openLatestWorkout(page);
  const sessionId = page.url().split('/').at(-1)!;

  await editElsewhere(sessionId, 7);
  await page.getByRole('button', { name: 'Delete workout' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();

  await expect(page.getByRole('alert')).toContainText('This workout was changed on another device.');
  await expect(setRow(page, 1).getByLabel('reps', { exact: true })).toHaveValue('7');
  await expect.poll(() => sessionCount(username)).toBe(1);

  await page.getByRole('button', { name: 'Delete workout' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Workout deleted.')).toBeVisible();
  await expect.poll(() => sessionCount(username)).toBe(0);
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

  await openTab(page, 'Collection');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  const workout = page.getByRole('list', { name: 'Workouts' }).getByRole('link').first();
  await expect(workout).toContainText('1 set · 300 kg volume · <1 min · Session RPE 8');
  await workout.click();
  await expect(page.getByRole('status', { name: 'Workout XP' })).toBeVisible();
  await expect(page.getByText('<1 min · Session RPE 8')).toBeVisible();
});
