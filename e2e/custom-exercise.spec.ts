import { expect, type Page, test } from '@playwright/test';
import { logExercise, openFromProfile, openTab, register, uniqueUsername } from './support/app.ts';

async function logLandmineSession(page: Page, weightKg: number) {
  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'landmine', 'Landmine Press', [{ weightKg, reps: 8 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
}

function collectionHeadings(page: Page) {
  return page.locator('main section h2');
}

test('create, log, record, pin, reorder and archive a custom exercise', async ({ page }) => {
  await register(page, uniqueUsername('cx'));

  await openFromProfile(page, 'Exercises');
  await page.getByRole('button', { name: 'New custom exercise' }).click();
  await expect(page.getByLabel('Chest')).toBeVisible();
  await expect(page.getByLabel('Endurance')).toHaveCount(0);
  await expect(page.getByLabel('Agility')).toHaveCount(0);
  await page.getByLabel('Name').fill('Landmine Press');
  await page.getByLabel('Load type').selectOption('external');
  await page.getByLabel('Equipment').selectOption('other');
  await page.getByLabel('Shoulders').fill('60');
  await page.getByLabel('Chest').fill('40');
  await expect(page.getByTestId('share-total')).toHaveText('Total: 100%');
  await page.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Landmine Press' })).toContainText('(custom)');

  await logLandmineSession(page, 40);
  const xp = page.getByLabel('XP gained');
  await expect(xp).toContainText('Shoulders');
  await expect(xp).toContainText('Chest');

  await logLandmineSession(page, 50);
  await expect(page.getByLabel('New records')).toContainText('Landmine Press: 8RM 50 kg');

  await openTab(page, 'Log');
  await page.getByLabel('Search exercises').fill('back squat');
  await page.getByRole('button', { name: /^Back Squat\b/ }).click();
  await expect(collectionHeadings(page)).toHaveText(['Back Squat', 'Landmine Press']);
  await page.getByLabel('Search exercises').fill('landmine');
  await page.getByRole('button', { name: /^Landmine Press\b/ }).click();
  const landmine = page.locator('section', { has: page.getByRole('heading', { name: 'Landmine Press', exact: true }) });
  await expect(landmine.getByRole('button', { name: 'Unpin' })).toBeVisible();
  await landmine.getByRole('button', { name: 'Up' }).click();
  await expect(collectionHeadings(page)).toHaveText(['Landmine Press', 'Back Squat']);
  await page.reload();
  await expect(collectionHeadings(page)).toHaveText(['Landmine Press', 'Back Squat']);

  await openFromProfile(page, 'Exercises');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Landmine Press' })
    .getByRole('button', { name: 'Archive' })
    .click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Landmine Press' })).toHaveCount(0);
  await page.getByLabel('Show archived').check();
  await expect(page.getByRole('listitem').filter({ hasText: 'Landmine Press' })).toContainText('(archived)');

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('landmine');
  await expect(page.getByRole('button', { name: /^Landmine Press\b/ })).toHaveCount(0);
  await page.getByLabel('Search exercises').fill('running');
  await expect(page.getByRole('button', { name: /^Running\b/ })).toHaveCount(0);

  await openTab(page, 'Log');
  await expect(landmine).toContainText('(archived)');
});
