import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  addExercise,
  logCardio,
  logExercise,
  logWorkout,
  openFromProfile,
  openSkill,
  openTab,
  register,
  uniqueUsername,
} from './support/app.ts';

async function logLandmineSession(page: Page, weightKg: number) {
  await openTab(page, 'Train');
  await logWorkout(page, () => logExercise(page, 'landmine', 'Landmine Press', [{ weightKg, reps: 8 }]));
}

function collectionHeadings(page: Page) {
  return page.getByRole('main').getByRole('heading', { level: 2 });
}

async function openChestExercises(page: Page) {
  await openSkill(page, 'Chest');
  return page.getByRole('list', { name: 'Exercises that train Chest' }).getByRole('listitem');
}

test('create, log, record, pin, reorder and archive a custom exercise', async ({ page }) => {
  await register(page, uniqueUsername('cx'));

  await openFromProfile(page, 'Custom exercises');
  await page.getByRole('button', { name: 'New custom exercise' }).click();
  await expect(page.getByLabel('Chest')).toBeVisible();
  await expect(page.getByLabel('Endurance')).toHaveCount(0);
  await expect(page.getByLabel('Agility')).toHaveCount(0);
  await page.getByLabel('Name').fill('Landmine Press');
  await page.getByLabel('Load type').selectOption('external');
  await page.getByLabel('Equipment').selectOption('other');
  await page.getByLabel('Shoulders').fill('60');
  await page.getByLabel('Chest').fill('40');
  await expect(page.getByText(/^Total: \d+%$/)).toHaveText('Total: 100%');
  await page.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Landmine Press' })).toContainText('(custom)');
  await expect((await openChestExercises(page)).filter({ hasText: 'Landmine Press' })).toHaveText('Landmine Press 40%');

  await logLandmineSession(page, 40);
  const xp = page.getByLabel('XP gained');
  await expect(xp).toContainText('Shoulders');
  await expect(xp).toContainText('Chest');

  await logLandmineSession(page, 50);
  await expect(page.getByLabel('New records')).toContainText('Landmine Press: 8RM 50 kg');

  await openTab(page, 'Collection');
  await addExercise(page, 'back squat', 'Back Squat');
  await expect(collectionHeadings(page)).toHaveText(['Back Squat', 'Landmine Press']);
  const landmine = await addExercise(page, 'landmine', 'Landmine Press');
  await expect(landmine.getByRole('button', { name: 'Unpin' })).toBeVisible();
  await landmine.getByRole('button', { name: 'Up' }).click();
  await expect(collectionHeadings(page)).toHaveText(['Landmine Press', 'Back Squat']);
  await page.reload();
  await expect(collectionHeadings(page)).toHaveText(['Landmine Press', 'Back Squat']);

  await openFromProfile(page, 'Custom exercises');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Landmine Press' })
    .getByRole('button', { name: 'Archive' })
    .click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Landmine Press' })).toHaveCount(0);
  await page.getByLabel('Show archived').check();
  await expect(page.getByRole('listitem').filter({ hasText: 'Landmine Press' })).toContainText('(archived)');
  await expect((await openChestExercises(page)).filter({ hasText: 'Landmine Press' })).toHaveCount(0);

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('landmine');
  await expect(page.getByRole('button', { name: /^Landmine Press\b/ })).toHaveCount(0);

  await openTab(page, 'Collection');
  await expect(landmine).toContainText('(archived)');
});

test('create and log a custom cardio exercise', async ({ page }) => {
  await register(page, uniqueUsername('cxc'));

  await openFromProfile(page, 'Custom exercises');
  await page.getByRole('button', { name: 'New custom exercise' }).click();
  await page.getByRole('radiogroup', { name: 'Kind' }).getByRole('radio', { name: 'Cardio' }).click();
  await expect(page.getByLabel('Load type')).toHaveCount(0);
  await expect(page.getByLabel('Chest')).toHaveCount(0);
  await page.getByLabel('Name').fill('Assault Bike');
  await page.getByLabel('Equipment').selectOption('machine');
  await page.getByLabel('Endurance').fill('70');
  await page.getByLabel('Agility').fill('30');
  await expect(page.getByText(/^Total: \d+%$/)).toHaveText('Total: 100%');
  await page.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Assault Bike' })).toContainText('(custom)');

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logCardio(page, 'assault', 'Assault Bike', [{ minutes: 20, effort: 'Hard' }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  const xp = page.getByLabel('XP gained');
  await expect(xp).toContainText('Endurance');
  await expect(xp).toContainText('Agility');
});

test('a custom exercise created from a workout comes back added to that workout', async ({ page }) => {
  await register(page, uniqueUsername('cx_wk'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('link', { name: 'Create custom exercise' }).click();
  await page.getByLabel('Name').fill('Landmine Press');
  await page.getByLabel('Load type').selectOption('external');
  await page.getByLabel('Equipment').selectOption('other');
  await page.getByLabel('Shoulders').fill('100');
  await page.getByRole('button', { name: 'Save exercise' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Landmine Press', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Landmine Press', exact: true })).toHaveCount(1);
});
