import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import {
  definitionOf,
  emailOf,
  finishWorkout,
  logExercise,
  logWorkout,
  openFromProfile,
  openTab,
  register,
  signIn,
  signOut,
  submitSignIn,
  TEST_PASSWORD,
  uniqueUsername,
} from './support/app.ts';
import { accountRowCount, heightOf, latestSetOf } from './support/db.ts';

function profileCard(page: Page) {
  return page.getByRole('region', { name: 'Profile', exact: true });
}

async function pickSetting(page: Page, group: string, option: string) {
  await openFromProfile(page, 'Settings');
  const choice = page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: option, exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
}

test('edit every profile field and see it on the profile', async ({ page }) => {
  const username = uniqueUsername('e2e');
  await register(page, username);

  await openTab(page, 'Profile');
  await expect(page.getByRole('heading', { level: 2, name: username, exact: true })).toBeVisible();
  await expect(definitionOf(page, 'Bodyweight')).toHaveText('Not set');

  await page.getByRole('link', { name: 'Edit profile & body' }).click();
  await page.getByLabel('Display name').fill('Iron Otter');
  await expect(page.getByRole('img', { name: /badge$/ })).toHaveCount(0);
  await page.getByLabel('Bio').fill('Chasing a 200 kg squat.');
  await page.getByLabel('Training focus').selectOption('strength');
  await page.getByLabel('Training since').fill('2019');
  await page.getByRole('radio', { name: 'Blue' }).click();
  await page.getByLabel('Bodyweight (kg)').fill('500');
  await expect(page.getByText('Bodyweight must be between 20 and 400 kg.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.getByLabel('Bodyweight (kg)').fill('8o');
  await expect(page.getByText('Bodyweight must be between 20 and 400 kg.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.getByLabel('Bodyweight (kg)').fill('82,4');
  await page.getByLabel('Height (cm)').fill('181');
  await page.getByLabel('Birth year (optional)').fill(String(new Date().getFullYear() - 12));
  await expect(page.getByText(/Birth year must be between/)).toBeVisible();
  await page.getByLabel('Birth year (optional)').fill('1990');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Iron Otter', exact: true })).toBeVisible();
  await expect(profileCard(page).getByText('Chasing a 200 kg squat.', { exact: true })).toBeVisible();
  await expect(profileCard(page).getByText('Training since 2019 · Strength focus', { exact: true })).toBeVisible();
  await expect(profileCard(page).getByRole('img', { name: 'Blue badge', exact: true })).toBeVisible();
  await expect(definitionOf(page, 'Bodyweight')).toHaveText('82.4 kg');
  await expect(definitionOf(page, 'Height')).toHaveText('181 cm');
  await expect(definitionOf(page, 'Age')).toHaveText(`about ${new Date().getFullYear() - 1990}`);

  await page.getByRole('button', { name: 'Increase bodyweight by 0.1 kg' }).click();
  await page.getByRole('button', { name: 'Save 82.5 kg' }).click();
  await expect(page.getByRole('button', { name: 'Save 82.5 kg' })).toHaveCount(0);
  await page.reload();
  await expect(definitionOf(page, 'Bodyweight')).toHaveText('82.5 kg');

  await openFromProfile(page, 'Settings');
  const showWeights = page.getByRole('switch', { name: 'Show my weights to friends' });
  await expect(showWeights).toHaveAttribute('aria-checked', 'true');
  await showWeights.click();
  await expect(showWeights).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(showWeights).toHaveAttribute('aria-checked', 'false');

  await openTab(page, 'Profile');
  await page.getByRole('link', { name: 'Preview what friends see' }).click();
  await expect(
    page.getByRole('region', { name: 'How your records appear' }).getByText('New 8RM Back Squat', { exact: true }),
  ).toBeVisible();
  await expect(profileCard(page).getByText('Chasing a 200 kg squat.', { exact: true })).toBeVisible();
  await expect(page.getByText('82.5')).toHaveCount(0);

  expect(await heightOf(username)).toBe(181);
  await pickSetting(page, 'Weight units', 'Pounds');
  await openTab(page, 'Profile');
  await expect(definitionOf(page, 'Height')).toHaveText('5 ft 11 in');
  await page.getByRole('link', { name: 'Edit profile & body' }).click();
  await expect(page.getByLabel('Height feet')).toHaveValue('5');
  await page.getByLabel('Bio').fill('Only the bio changed.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(profileCard(page).getByText('Only the bio changed.', { exact: true })).toBeVisible();
  expect(await heightOf(username)).toBe(181);
});

test('pounds are shown everywhere while kilograms are stored, without false records', async ({ page }) => {
  const username = uniqueUsername('e2e_lb');
  await register(page, username);
  await pickSetting(page, 'Weight units', 'Pounds');

  for (const round of [1, 2]) {
    await openTab(page, 'Train');
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.getByLabel('Search exercises').fill('bench');
    await page.getByRole('button', { name: /^Barbell Bench Press\b/ }).click();
    const row = page.locator('li.set-row').first();
    await row.getByRole('spinbutton', { name: 'lb', exact: true }).fill('135');
    await row.getByLabel('reps').fill('5');
    await row.getByRole('radio', { name: 'Hard' }).click();
    await finishWorkout(page);
    await expect(page.getByLabel('New records')).toHaveCount(0);
    expect((await latestSetOf(username)).weight_kg, `round ${round}`).toBe(61.23);
  }

  await openTab(page, 'Log');
  const bench = page.locator('section', {
    has: page.getByRole('heading', { name: 'Barbell Bench Press', exact: true }),
  });
  await expect(bench.locator('.record-slot.filled')).toHaveText(['5RM 135 lb']);
});

test('RPE effort is logged as RPE and stored as reps in reserve', async ({ page }) => {
  const username = uniqueUsername('e2e_rpe');
  await register(page, username);
  await pickSetting(page, 'How you rate effort', 'RPE');

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('bench');
  await page.getByRole('button', { name: /^Barbell Bench Press\b/ }).click();
  const row = page.locator('li.set-row').first();
  await row.getByRole('spinbutton', { name: 'kg', exact: true }).fill('60');
  await row.getByLabel('reps').fill('8');
  await expect(row.getByRole('radio', { name: 'Hard' })).toHaveCount(0);
  await row.getByRole('radio', { name: 'RPE 8', exact: true }).click();
  await finishWorkout(page);

  expect(await latestSetOf(username)).toMatchObject({ effort_input_type: 'rpe', effort_value: 8, rir: 2 });
});

test('the time zone can change once, then waits 7 days', async ({ page }) => {
  await register(page, uniqueUsername('e2e_tz'));
  await openFromProfile(page, 'Settings');
  await page.getByLabel('Change to').selectOption('Asia/Tokyo');
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await expect(page.getByText('Time zone changed to Asia/Tokyo.')).toBeVisible();
  await expect(definitionOf(page.getByRole('region', { name: 'Time zone' }), 'Current')).toHaveText('Asia/Tokyo');
  await expect(page.getByLabel('Change to')).toBeDisabled();
  await page.reload();
  await expect(page.getByText(/Your next change is possible on/)).toBeVisible();
});

test('change password, export data and delete the account', async ({ page }) => {
  const username = uniqueUsername('e2e_acct');
  await register(page, username);
  await logWorkout(page, () => logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]));

  await openFromProfile(page, 'Settings');
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByLabel('Current password').fill('wrong-password');
  await page.getByLabel('New password').fill('a-brand-new-password');
  await page.getByRole('button', { name: 'Change password' }).last().click();
  await expect(page.getByText('Your current password is wrong.')).toBeVisible();
  await page.getByLabel('Current password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).last().click();
  await expect(page.getByText('Password changed.')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^gainscape-export-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(exported.profile.username).toBe(username);
  expect(exported.sets).toHaveLength(1);

  await signOut(page);
  await signIn(page, username, 'a-brand-new-password');

  await openFromProfile(page, 'Settings');
  await page.getByRole('button', { name: 'Delete account' }).click();
  const confirm = page.getByRole('button', { name: 'Delete forever' });
  await page.getByLabel(/Type your username/).fill('someone_else');
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Type your username/).fill(username);
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Your password').fill('wrong-password');
  await confirm.click();
  await expect(page.getByText('Your password is wrong.')).toBeVisible();
  expect(await accountRowCount(username)).toBe(1);
  await page.getByLabel('Your password').fill('a-brand-new-password');
  await confirm.click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await accountRowCount(username)).toBe(0);

  await submitSignIn(page, emailOf(username), 'a-brand-new-password');
  await expect(page.getByRole('alert')).toBeVisible();
});
