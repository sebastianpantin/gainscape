import { expect, test } from './support/fixtures.ts';
import {
  breakIndexedDbOpen,
  logExercise,
  readFallbackDraft,
  readSession,
  readStoredDraft,
  register,
  setIndexedDbBroken,
  signIn,
  signOut,
  uniqueUsername,
} from './support/app.ts';
import { sessionCount, sessionRow } from './support/db.ts';

const completeSession = '**/functions/v1/complete-session';
const LONGEST_RETRY_WAIT_MS = 30_000;
const LATE_REQUEST_GRACE_MS = 1_000;

test('a finished workout survives an outage and a reload', { tag: '@smoke' }, async ({ page }) => {
  const username = uniqueUsername('dr_a');
  await register(page, username);
  const { user } = await readSession(page);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);

  let outage = true;
  await page.route(completeSession, (route) => (outage ? route.abort() : route.continue()));
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByText(/Couldn't reach the server/)).toBeVisible();
  const stored = await readStoredDraft(page, user.id);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saving workout…' })).toBeVisible();
  await expect(page.getByText(/Couldn't reach the server/)).toBeVisible();
  outage = false;
  await page.getByRole('button', { name: 'Retry now' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect.poll(() => sessionCount(username)).toBe(1);
  await expect.poll(() => sessionRow(stored!.draft!.sessionId)).not.toBeNull();
});

test('a workout the server keeps failing on stops retrying and syncs on a manual retry', async ({ page }) => {
  const username = uniqueUsername('dr_s');
  await page.clock.install();
  await register(page, username);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);

  let serverFailing = true;
  let failedAttempts = 0;
  await page.route(completeSession, (route) => {
    if (!serverFailing || route.request().method() !== 'POST') return route.continue();
    failedAttempts += 1;
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'internal_error' }),
    });
  });
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('alert')).toHaveText(/The server keeps failing to save this workout \(internal_error\)/, {
    timeout: 30_000,
  });
  const attemptsWhenStalled = failedAttempts;
  const lateRetry = page.waitForRequest(completeSession, { timeout: LATE_REQUEST_GRACE_MS }).then(
    () => true,
    () => false,
  );
  await page.clock.runFor(LONGEST_RETRY_WAIT_MS * 2);
  expect(await lateRetry).toBe(false);
  expect(failedAttempts).toBe(attemptsWhenStalled);

  serverFailing = false;
  await page.getByRole('button', { name: 'Retry now' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect.poll(() => sessionCount(username)).toBe(1);
});

test("another account's draft is kept, never sent, and restored for its owner", async ({ page }) => {
  const owner = uniqueUsername('dr_o');
  const other = uniqueUsername('dr_b');
  await register(page, owner);
  const { user } = await readSession(page);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await expect.poll(async () => (await readStoredDraft(page, user.id))?.kind).toBe('draft');
  const ownerSessionId = (await readStoredDraft(page, user.id))!.draft!.sessionId;

  const leakedRequests: string[] = [];
  page.on('request', (request) => {
    if (`${request.url()} ${request.postData() ?? ''}`.includes(ownerSessionId)) leakedRequests.push(request.url());
  });

  page.once('dialog', (dialog) => dialog.accept());
  await signOut(page);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

  await register(page, other);
  const notice = page.getByText('An unsynced workout from another account is saved on this device.');
  await expect(notice).toBeVisible();

  let confirmShown = false;
  page.once('dialog', (dialog) => {
    confirmShown = true;
    return dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Discard it' }).click();
  await expect.poll(() => confirmShown).toBe(true);
  await expect(notice).toBeVisible();
  await expect.poll(() => readStoredDraft(page, user.id)).toMatchObject({ kind: 'draft' });

  await signOut(page);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Barbell Bench Press', exact: true })).toBeVisible();
  expect(leakedRequests).toEqual([]);
});

test('a draft written while IndexedDB was unavailable moves back into IndexedDB', async ({ page }) => {
  await breakIndexedDbOpen(page);
  await register(page, uniqueUsername('dr_f'));
  const { user } = await readSession(page);

  await setIndexedDbBroken(page, true);
  await page.reload();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await expect.poll(async () => (await readFallbackDraft(page, user.id))?.kind).toBe('draft');

  await setIndexedDbBroken(page, false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Barbell Bench Press', exact: true })).toBeVisible();
  await expect.poll(() => readFallbackDraft(page, user.id)).toBeNull();
  await expect.poll(() => readStoredDraft(page, user.id)).toMatchObject({ kind: 'draft' });
});

test('a workout started while IndexedDB was unreadable is announced and opens after the stored one', async ({
  page,
}) => {
  await breakIndexedDbOpen(page);
  await register(page, uniqueUsername('dr_g'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);

  await setIndexedDbBroken(page, true);
  await page.reload();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'back squat', 'Back Squat', [{ weightKg: 80, reps: 5 }]);

  await setIndexedDbBroken(page, false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Barbell Bench Press', exact: true })).toBeVisible();
  const waiting = page.getByText('Another unsynced workout is saved on this device.', { exact: false });
  await expect(waiting).toBeVisible();

  await page.getByRole('button', { name: 'Discard workout' }).click();
  await page
    .getByRole('dialog', { name: 'Discard this workout?' })
    .getByRole('button', { name: 'Discard workout' })
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Back Squat', exact: true })).toBeVisible();
  await expect(waiting).toHaveCount(0);
});

test('a workout the server rejects is discarded only after a confirm', async ({ page }) => {
  const username = uniqueUsername('dr_rj');
  await register(page, username);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await page.route(completeSession, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 400,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'invalid_payload' }),
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('alert')).toHaveText('The server rejected this workout: invalid_payload');

  await page.getByRole('button', { name: 'Discard workout' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard this workout?' });
  await expect(dialog).toContainText('Your logged sets will be lost.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saving workout…' })).toBeVisible();

  await page.getByRole('button', { name: 'Discard workout' }).click();
  await dialog.getByRole('button', { name: 'Discard workout' }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  expect(await sessionCount(username)).toBe(0);
});
