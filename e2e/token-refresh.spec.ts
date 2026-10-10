import { expect, test } from './support/fixtures.ts';
import {
  finishedBenchDraft,
  finishWorkout,
  logExercise,
  nowInSeconds,
  readSession,
  register,
  signIn,
  uniqueUsername,
  writeSession,
  writeStoredDraft,
} from './support/app.ts';
import { builtInExerciseId, resignedWithAnotherKey, sessionCount } from './support/db.ts';

const completeSession = '/functions/v1/complete-session';

test('an expired access token is refreshed before the single POST', async ({ page }) => {
  const username = uniqueUsername('tr_a');
  await register(page, username);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);

  const events: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/auth/v1/token') && request.url().includes('grant_type=refresh_token'))
      events.push('refresh');
  });
  page.on('response', (response) => {
    if (response.url().includes(completeSession)) events.push(`post ${response.status()}`);
  });

  await writeSession(page, { expires_at: nowInSeconds() - 60 });
  await finishWorkout(page);
  expect(events.filter((event) => event.startsWith('post'))).toEqual(['post 200']);
  expect(events.indexOf('refresh')).toBeGreaterThanOrEqual(0);
  expect(events.indexOf('refresh')).toBeLessThan(events.indexOf('post 200'));
  await expect.poll(() => sessionCount(username)).toBe(1);
});

test('a token signed with the wrong key is refreshed after a 401', async ({ page }) => {
  const username = uniqueUsername('tr_b');
  await register(page, username);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);

  const statuses: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes(completeSession)) statuses.push(response.status());
  });

  const session = await readSession(page);
  await writeSession(page, {
    access_token: resignedWithAnotherKey(session.access_token),
    expires_at: nowInSeconds() + 3600,
  });
  await finishWorkout(page);
  expect(statuses).toEqual([401, 200]);
  await expect.poll(() => sessionCount(username)).toBe(1);
});

test('a workout kept through a forced sign-out syncs after signing in again', async ({ page }) => {
  const username = uniqueUsername('tr_c');
  await register(page, username);
  const { user } = await readSession(page);
  await writeStoredDraft(
    page,
    user.id,
    finishedBenchDraft(crypto.randomUUID(), await builtInExerciseId('barbell_bench_press')),
  );
  await writeSession(page, { expires_at: nowInSeconds() - 60, refresh_token: 'garbage-refresh-token' });

  await page.reload();
  await expect(page.getByText('Your unsynced workout is saved on this device. Sign in to sync it.')).toBeVisible();
  await signIn(page, username);
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect.poll(() => sessionCount(username)).toBe(1);
});

test('an auth outage keeps the user signed in and syncs once the auth server is back', async ({ page }) => {
  test.setTimeout(180_000);
  const username = uniqueUsername('tr_d');
  await register(page, username);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);

  const tokenEndpoint = '**/auth/v1/token**';
  await page.route(tokenEndpoint, (route) => route.abort());
  await writeSession(page, { expires_at: nowInSeconds() - 60 });
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Saving workout…' })).toBeVisible();
  await expect(page.getByText(/Couldn't reach the server/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);

  await page.unroute(tokenEndpoint);
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible({ timeout: 120_000 });
  await expect.poll(() => sessionCount(username)).toBe(1);
});
