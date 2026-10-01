import { expect, test } from '@playwright/test';
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

test('a finished workout survives an outage and a reload', async ({ page }) => {
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
  expect(await sessionCount(username)).toBe(1);
  expect(await sessionRow(stored!.draft!.sessionId)).not.toBeNull();
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
  expect(await readStoredDraft(page, user.id)).toMatchObject({ kind: 'draft' });

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
  expect(await readFallbackDraft(page, user.id)).toBeNull();
  expect(await readStoredDraft(page, user.id)).toMatchObject({ kind: 'draft' });
});
