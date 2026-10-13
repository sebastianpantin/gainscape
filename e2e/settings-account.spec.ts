import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  definitionOf,
  emailOf,
  logBench,
  logExercise,
  openFromProfile,
  openTab,
  readSession,
  readStoredDraft,
  register,
  TEST_PASSWORD,
  uniqueUsername,
} from './support/app.ts';
import { accountRowCount, sessionCount } from './support/db.ts';

const UNSYNCED_WARNING = 'You have a workout that has not synced yet. It will be lost. Delete anyway?';

function answerNextDialog(page: Page, answer: 'accept' | 'dismiss'): string[] {
  const messages: string[] = [];
  page.once('dialog', (dialog) => {
    messages.push(dialog.message());
    void (answer === 'accept' ? dialog.accept() : dialog.dismiss());
  });
  return messages;
}

async function fillDeleteForm(page: Page, username: string) {
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByLabel(/Type your username/).fill(username);
  await page.getByLabel('Your password').fill(TEST_PASSWORD);
}

test('deleting the account warns about an unsynced workout and only deletes once confirmed', async ({ page }) => {
  const username = uniqueUsername('st_del');
  await register(page, username);
  const { user } = await readSession(page);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await expect.poll(async () => (await readStoredDraft(page, user.id))?.kind).toBe('draft');

  await openFromProfile(page, 'Settings');
  await fillDeleteForm(page, username);
  const dismissed = answerNextDialog(page, 'dismiss');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await expect.poll(() => dismissed).toEqual([UNSYNCED_WARNING]);
  await expect(page.getByRole('button', { name: 'Delete forever' })).toBeEnabled();
  expect(await accountRowCount(username)).toBe(1);
  expect((await readStoredDraft(page, user.id))?.kind).toBe('draft');

  const accepted = answerNextDialog(page, 'accept');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(accepted).toEqual([UNSYNCED_WARNING]);
  await expect.poll(() => accountRowCount(username)).toBe(0);
  expect(await readStoredDraft(page, user.id)).toMatchObject({ kind: 'synced', tombstone: 'forgotten' });
  await expect(page.getByText('Your unsynced workout is saved on this device.')).toHaveCount(0);
});

async function openHistory(page: Page) {
  await openTab(page, 'Collection');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
}

test('resetting all data needs RESET typed, wipes the workouts and keeps the account signed in', async ({ page }) => {
  const username = uniqueUsername('st_rst');
  await register(page, username);
  await logBench(page);
  await openHistory(page);
  await expect(page.getByText('No workouts yet. Finish one and it shows up here.')).toHaveCount(0);

  await openFromProfile(page, 'Settings');
  await page.getByRole('button', { name: 'Reset all data' }).click();
  const confirm = page.getByLabel('Type RESET to confirm');
  await confirm.fill('reset');
  await expect(page.getByRole('button', { name: 'Reset everything' })).toBeDisabled();
  await confirm.fill('RESET');
  await page.getByRole('button', { name: 'Reset everything' }).click();

  await expect(
    page.getByRole('status').getByText('Your data was reset. You start again from level 1.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Type RESET to confirm')).toHaveCount(0);
  expect(await sessionCount(username)).toBe(0);
  expect(await accountRowCount(username)).toBe(1);
  await openHistory(page);
  await expect(page.getByText('No workouts yet. Finish one and it shows up here.')).toBeVisible();
});

test('a failed email change says so and keeps the form open with the old email', async ({ page }) => {
  const username = uniqueUsername('st_em');
  const newEmail = `${username}.new@example.test`;
  await register(page, username);
  await openFromProfile(page, 'Settings');
  await page.route('**/auth/v1/user**', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 500,
            error_code: 'unexpected_failure',
            msg: 'Error sending email change email',
          }),
        })
      : route.fallback(),
  );

  await page.getByRole('button', { name: 'Change email' }).click();
  await page.getByLabel('New email').fill(newEmail);
  await page.getByRole('button', { name: 'Send confirmation' }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not change your email.');
  await expect(page.getByRole('button', { name: 'Send confirmation' })).toBeEnabled();
  await expect(page.getByLabel('New email')).toHaveValue(newEmail);
  await expect(definitionOf(page, 'Email')).toHaveText(emailOf(username));

  await page.unroute('**/auth/v1/user**');
  await page.getByRole('button', { name: 'Send confirmation' }).click();
  await expect(page.getByText(`We sent confirmation links to ${emailOf(username)} and ${newEmail}.`)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a failed export says so without downloading, and a retry downloads the data', async ({ page }) => {
  const username = uniqueUsername('st_ex');
  await register(page, username);
  await openFromProfile(page, 'Settings');
  await page.route('**/functions/v1/export-data', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error' }) }),
  );
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));

  await page.getByRole('button', { name: 'Export my data' }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not export your data.');
  await expect(page.getByRole('button', { name: 'Export my data' })).toBeEnabled();
  await expect(page.getByText('Your data was downloaded.')).toHaveCount(0);
  expect(downloads).toEqual([]);

  await page.unroute('**/functions/v1/export-data');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  expect((await download).suggestedFilename()).toMatch(/^gainscape-export-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByText('Your data was downloaded.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
