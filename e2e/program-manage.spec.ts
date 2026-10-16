import { expect, test } from './support/fixtures.ts';
import { nativeDialogsOf, openTab, readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentOf } from './support/db.ts';
import {
  fillProgramInputs,
  FIVE_THREE_ONE_ONE_RMS_KG,
  followProgram,
  MADCOW_FIVE_RMS_KG,
  openEnrollForm,
  openManageProgram,
  programToday,
} from './support/program-enrollment.ts';

const OFFLINE_TEXT = "You're offline. Starting or editing a program needs a connection.";

test('the manage program screen shows "Loading program…" while the first refresh runs with nothing cached', async ({
  page,
}) => {
  await register(page, uniqueUsername('pm_load'));
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/rest/v1/program_enrollments*', async (route) => {
    await released;
    await route.continue();
  });
  await page.goto('/programs/active');
  await expect(page.getByText('Loading program…', { exact: true })).toBeVisible();
  await expect(page.getByText("You're not following a program.")).toHaveCount(0);
  release();
  await expect(page.getByText("You're not following a program.")).toBeVisible();
  await expect(page.getByText('Loading program…', { exact: true })).toHaveCount(0);
});

test('starting or editing a program offline says it needs a connection and disables the buttons', async ({
  context,
  page,
}) => {
  await register(page, uniqueUsername('pm_off'));
  await openEnrollForm(page, 'Madcow 5x5');
  await fillProgramInputs(page, MADCOW_FIVE_RMS_KG);
  const startFollowing = page.getByRole('button', { name: 'Start following', exact: true });
  await expect(startFollowing).toBeEnabled();

  await context.setOffline(true);
  await expect(page.getByText(OFFLINE_TEXT, { exact: true })).toBeVisible();
  await expect(startFollowing).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText(OFFLINE_TEXT, { exact: true })).toHaveCount(0);
  await expect(startFollowing).toBeEnabled();

  await startFollowing.click();
  await expect(programToday(page, 'Madcow 5x5')).toBeVisible();
  await openManageProgram(page, 'Madcow 5x5');
  const saveChanges = page.getByRole('button', { name: 'Save changes', exact: true });
  await expect(saveChanges).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByText(OFFLINE_TEXT, { exact: true })).toBeVisible();
  await expect(saveChanges).toBeDisabled();
  await context.setOffline(false);
  await expect(saveChanges).toBeEnabled();
});

test('the enroll form keeps a cleared number field empty and reads 2.5 typed into it', async ({ page }) => {
  await register(page, uniqueUsername('pm_raw'));
  await openEnrollForm(page, '5/3/1');
  for (const label of ['Squat 1RM (kg)', 'Round to (kg)', 'Bar weight (kg)', 'Training max reset']) {
    const field = page.getByLabel(label, { exact: true });
    await field.fill('');
    await expect(field, `${label} after clearing`).toHaveValue('');
    await field.fill('2.5');
    await expect(field, `${label} after typing 2.5`).toHaveValue('2.5');
  }
});

test('the enroll form refuses a rounding increment that is not offered', async ({ page }) => {
  const username = uniqueUsername('pm_round');
  await register(page, username);
  await openEnrollForm(page, 'Madcow 5x5');
  await fillProgramInputs(page, MADCOW_FIVE_RMS_KG);
  await page.getByLabel('Round to (kg)', { exact: true }).fill('3');
  await page.getByLabel('Bar weight (kg)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Start following', exact: true }).click();
  const increment = page.getByLabel('Round to (kg)', { exact: true });
  const barWeight = page.getByLabel('Bar weight (kg)', { exact: true });
  await expect(page.getByRole('alert')).toHaveText('2 fields need fixing.');
  await expect(increment).toBeFocused();
  await expect(increment).toHaveAttribute('aria-invalid', 'true');
  await expect(increment).toHaveAccessibleDescription('Round to (kg) must be one of 0.5, 1, 1.25, 2.5 or 5');
  await expect(barWeight).toHaveAttribute('aria-invalid', 'true');
  await expect(barWeight).toHaveAccessibleDescription('Bar weight (kg) must be above 0');
  await expect.poll(() => activeEnrollmentOf(username)).toBeNull();

  await increment.fill('2.5');
  await expect(increment).not.toHaveAttribute('aria-invalid');
});

test('the enroll form suggests the empty bar for working weights and keeps exercise swaps folded away', async ({
  page,
}) => {
  await register(page, uniqueUsername('pm_hint'));
  await openEnrollForm(page, 'StrongLifts 5x5');
  await expect(
    page.getByRole('radiogroup', { name: 'Unit', exact: true }).getByRole('radio', { name: 'Kilograms', exact: true }),
  ).toBeChecked();
  const squat = page.getByLabel('Squat working weight (kg)', { exact: true });
  await expect(squat).toHaveAttribute('placeholder', 'e.g. 20');
  await expect(squat).toHaveAccessibleDescription('New to a lift? Start with the empty bar: 20 kg.');
  await page.getByRole('button', { name: 'Start following', exact: true }).click();
  await expect(squat).toBeFocused();
  await expect(squat).toHaveAccessibleDescription(
    'Enter Squat working weight (kg) New to a lift? Start with the empty bar: 20 kg.',
  );

  const squatExercise = page.getByLabel('Squat exercise', { exact: true });
  await expect(squatExercise).toBeHidden();
  await page.getByText('Change exercises', { exact: true }).click();
  await expect(squatExercise).toBeVisible();
});

test('stop following a program through an in-app confirmation dialog', async ({ page }) => {
  const username = uniqueUsername('pm_stop');
  await register(page, username);
  const nativeDialogs = nativeDialogsOf(page);
  await followProgram(page, '5/3/1', FIVE_THREE_ONE_ONE_RMS_KG);
  await openManageProgram(page, '5/3/1');

  const stopFollowing = page.getByRole('button', { name: 'Stop following', exact: true });
  await expect(stopFollowing).toBeVisible();
  await stopFollowing.click();
  const dialog = page.getByRole('dialog', { name: 'Stop following 5/3/1?', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => activeEnrollmentOf(username)).not.toBeNull();

  await stopFollowing.click();
  await dialog.getByRole('button', { name: 'Stop following', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => activeEnrollmentOf(username)).toBeNull();
  await openTab(page, 'Train');
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(programToday(page, '5/3/1')).toHaveCount(0);
  expect(nativeDialogs).toEqual([]);
});

test('following another program asks to replace the current one in an in-app dialog', async ({ page }) => {
  const username = uniqueUsername('pm_repl');
  await register(page, username);
  const nativeDialogs = nativeDialogsOf(page);
  await followProgram(page, 'Madcow 5x5', MADCOW_FIVE_RMS_KG);

  await openEnrollForm(page, '5/3/1');
  await fillProgramInputs(page, FIVE_THREE_ONE_ONE_RMS_KG);
  await page.getByRole('button', { name: 'Start following', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace Madcow 5x5?', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Follow 5/3/1', exact: true })).toBeVisible();
  await expect.poll(() => activeEnrollmentOf(username)).toMatchObject({ template_key: 'madcow_5x5' });

  await page.getByRole('button', { name: 'Start following', exact: true }).click();
  await dialog.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(programToday(page, '5/3/1')).toBeVisible();
  await expect(programToday(page, 'Madcow 5x5')).toHaveCount(0);
  await expect.poll(() => activeEnrollmentOf(username)).toMatchObject({ template_key: 'five_three_one' });
  expect(nativeDialogs).toEqual([]);
});

test('a partly failed save shows a friendly error and the fields fall back to the server values', async ({ page }) => {
  await register(page, uniqueUsername('pm_part'));
  await followProgram(page, '5/3/1', FIVE_THREE_ONE_ONE_RMS_KG);
  await openManageProgram(page, '5/3/1');
  let adjustCalls = 0;
  await page.route('**/rest/v1/rpc/adjust_enrollment', async (route) => {
    adjustCalls += 1;
    if (adjustCalls === 1) await route.continue();
    else await route.abort('failed');
  });

  await page.getByLabel('Squat training max (kg)', { exact: true }).fill('100');
  await page.getByLabel('Bench press training max (kg)', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toHaveText("Couldn't reach the server. Check your connection.");
  await expect(alert).not.toContainText('Failed to fetch');
  await expect(page.getByLabel('Squat training max (kg)', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Bench press training max (kg)', { exact: true })).toHaveValue('72');
  expect(adjustCalls).toBe(2);
});

test('an enrolled program whose template is not cached says to reconnect when templates cannot load', async ({
  page,
}) => {
  await register(page, uniqueUsername('pm_tmpl'));
  const { user } = await readSession(page);
  await followProgram(page, 'Madcow 5x5', MADCOW_FIVE_RMS_KG);
  await page.evaluate((key) => {
    const cached = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...cached, templates: [] }));
  }, `gainscape.powerlifting-programs.v1.${user.id}`);
  await page.route('**/rest/v1/program_templates*', (route) => route.abort('failed'));
  await page.reload();
  await expect(page.getByText('Program details unavailable — reconnect to load them', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Start: / })).toHaveCount(0);
});
