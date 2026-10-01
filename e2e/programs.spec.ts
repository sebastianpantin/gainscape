import { expect, type Page, test } from '@playwright/test';
import { openFromProfile, openTab, readSession, readStoredDraft, register, uniqueUsername } from './support/app.ts';
import { programDayId, sessionRow, setCount } from './support/db.ts';

function exerciseCard(page: Page, name: string) {
  return page.locator('section', { has: page.getByRole('heading', { name, exact: true }) });
}

test('copy a template, run a program day with planned sets and finish it', async ({ context, page }) => {
  const username = uniqueUsername('pg');
  await register(page, username);
  const { user } = await readSession(page);

  await openFromProfile(page, 'Programs');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Upper / Lower' })
    .getByRole('button', { name: 'Use this template' })
    .click();
  await expect(page.getByRole('heading', { name: 'Edit program' })).toBeVisible();
  await page.getByLabel('Program name').fill('My UL');
  await page
    .getByRole('region', { name: 'Day 1' })
    .getByRole('button', { name: 'Remove Cable Triceps Pushdown' })
    .click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your programs' })).toContainText('My UL');

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'My UL — Upper' }).click();
  await expect(page.locator('main section h2')).toHaveText([
    'Barbell Bench Press',
    'Barbell Row',
    'Overhead Press',
    'Lat Pulldown',
    'Barbell Curl',
  ]);
  await expect(page.locator('li.set-row')).toHaveCount(16);
  await expect(page.locator('li.set-row:not(.planned)')).toHaveCount(0);

  const benchRows = exerciseCard(page, 'Barbell Bench Press').locator('li.set-row');
  await benchRows.nth(0).getByRole('radio', { name: 'Hard' }).click();
  await benchRows.nth(1).getByRole('radio', { name: 'Hard' }).click();
  await exerciseCard(page, 'Barbell Row')
    .locator('li.set-row')
    .nth(0)
    .getByRole('button', { name: 'Done set 1' })
    .click();
  const toggled = benchRows.nth(2).getByRole('button', { name: 'Done set 3' });
  await toggled.click();
  await expect(toggled).toHaveAttribute('aria-pressed', 'true');
  await toggled.click();
  await expect(toggled).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('li.set-row:not(.planned)')).toHaveCount(3);

  let confirmation = '';
  page.once('dialog', (dialog) => {
    confirmation = dialog.message();
    return dialog.accept();
  });
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  expect(confirmation).toBe('13 planned sets not done will be skipped');

  const stored = await readStoredDraft(page, user.id);
  const sessionId = stored!.syncedSessionId!;
  expect((await sessionRow(sessionId)).program_day_id).toBe(await programDayId(username, 'My UL', 'Upper'));
  expect(await setCount(sessionId)).toBe(3);

  const fresh = await context.newPage();
  await fresh.route('**/rest/v1/programs*', (route) => route.abort());
  await fresh.goto('/');
  await expect(fresh.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(fresh.getByText("Couldn't load your programs")).toBeVisible({ timeout: 15_000 });
  await expect(fresh.getByRole('button', { name: 'My UL — Upper' })).toHaveCount(0);
});
