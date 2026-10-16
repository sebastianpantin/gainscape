import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  finishWorkout,
  nativeDialogsOf,
  openFromProfile,
  openTab,
  register,
  setRow,
  uniqueUsername,
} from './support/app.ts';
import { activeEnrollmentOf } from './support/db.ts';
import {
  createSquatAndBenchProgram,
  dayPicker,
  markEverySetDone,
  openOwnProgramFollowForm,
  ownProgram,
  prescribedRows,
  programToday,
  repeated,
  startFollowing,
  weightsIn,
  workoutCards,
} from './support/program-enrollment.ts';

const PROGRAM = 'My Squat 5x5';
const OUTDATED_TEXT = "You're following an earlier version";
const OFFLINE_TEXT = "You're offline. Starting or editing a program needs a connection.";

async function followAtSquat(page: Page, squatKg: number): Promise<void> {
  await openOwnProgramFollowForm(page, PROGRAM);
  await expect(page.getByLabel('Back Squat exercise', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Barbell Bench Press working weight (kg)', { exact: true })).toHaveCount(0);
  await page.getByLabel('Back Squat working weight (kg)', { exact: true }).fill(String(squatKg));
  await startFollowing(page, PROGRAM);
}

async function logSessionWithBenchAt(page: Page, sessionLabel: string, benchKg: number): Promise<void> {
  await programToday(page, PROGRAM)
    .getByRole('button', { name: `Start: ${PROGRAM} — ${sessionLabel}`, exact: true })
    .click();
  await expect(page.getByText(`${PROGRAM} — ${sessionLabel}`, { exact: true })).toBeVisible();
  const bench = workoutCards(page, 'Barbell Bench Press');
  for (const setNumber of [1, 2, 3])
    await setRow(bench, setNumber)
      .getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ })
      .fill(String(benchKg));
}

async function finishAndReturn(page: Page): Promise<void> {
  await finishWorkout(page);
  await page.getByRole('link', { name: 'Done' }).click();
}

test('follow your own program: Squat 5×5 adds 2.5 kg after a met workout and holds it after a miss', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const username = uniqueUsername('pc_follow');
  await register(page, username);
  await createSquatAndBenchProgram(page, PROGRAM);
  await expect(page.getByRole('region', { name: 'Powerlifting programs' })).not.toContainText(PROGRAM);

  await followAtSquat(page, 100);
  await expect
    .poll(() => activeEnrollmentOf(username))
    .toMatchObject({ template_key: expect.stringMatching(/^custom_/) });
  const today = programToday(page, PROGRAM);
  await expect(dayPicker(today).getByRole('radio', { name: 'Session 1 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(['5 × 5 @ 100 kg']);

  await logSessionWithBenchAt(page, 'Session 1 Day 1', 60);
  await expect.poll(() => weightsIn(workoutCards(page, 'Back Squat'))).toEqual(repeated('100', 5));
  await markEverySetDone(page);
  await finishAndReturn(page);

  const afterMet = programToday(page, PROGRAM);
  await expect(dayPicker(afterMet).getByRole('radio', { name: 'Session 2 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(afterMet, 'Back Squat')).toHaveText(['5 × 5 @ 102.5 kg']);

  await context.setOffline(true);
  await openTab(page, 'Profile');
  await openTab(page, 'Train');
  await logSessionWithBenchAt(page, 'Session 2 Day 1', 60);
  await expect.poll(() => weightsIn(workoutCards(page, 'Back Squat'))).toEqual(repeated('102.5', 5));
  await setRow(workoutCards(page, 'Back Squat'), 5)
    .getByRole('spinbutton', { name: /^Reps, set \d+$/ })
    .fill('3');
  await markEverySetDone(page);
  await context.setOffline(false);
  await finishAndReturn(page);

  const afterMiss = programToday(page, PROGRAM);
  await expect(dayPicker(afterMiss).getByRole('radio', { name: 'Session 3 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(afterMiss, 'Back Squat')).toHaveText(['5 × 5 @ 102.5 kg']);
});

test('Follow on your own program is disabled offline and says it needs a connection', async ({ context, page }) => {
  await register(page, uniqueUsername('pc_off'));
  await createSquatAndBenchProgram(page, PROGRAM);
  await openFromProfile(page, 'Programs');
  const follow = ownProgram(page, PROGRAM).getByRole('button', { name: 'Follow', exact: true });
  await expect(follow).toBeEnabled();

  await context.setOffline(true);
  await expect(page.getByText(OFFLINE_TEXT, { exact: true })).toBeVisible();
  await expect(follow).toBeDisabled();
  await context.setOffline(false);
  await expect(follow).toBeEnabled();
});

test('edit a followed program, use the changes keeping Squat at 102.5, then delete it and stop following', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const username = uniqueUsername('pc_edit');
  await register(page, username);
  const nativeDialogs = nativeDialogsOf(page);
  await createSquatAndBenchProgram(page, PROGRAM);
  await followAtSquat(page, 100);
  await logSessionWithBenchAt(page, 'Session 1 Day 1', 60);
  await markEverySetDone(page);
  await finishAndReturn(page);
  await expect(prescribedRows(programToday(page, PROGRAM), 'Back Squat')).toHaveText(['5 × 5 @ 102.5 kg']);

  await openFromProfile(page, 'Programs');
  await ownProgram(page, PROGRAM).getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit program' })).toBeVisible();
  await expect(page.getByText(OUTDATED_TEXT)).toHaveCount(0);
  const bench = page
    .getByRole('region', { name: 'Day 1', exact: true })
    .getByRole('listitem')
    .filter({ has: page.getByText('Barbell Bench Press', { exact: true }) });
  await bench.getByLabel('Sets').fill('4');
  await expect(page.getByText(OUTDATED_TEXT)).toBeVisible();
  await page.getByRole('button', { name: 'Use these changes', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: `Follow ${PROGRAM}`, exact: true })).toBeVisible();
  await expect(page.getByLabel('Back Squat working weight (kg)', { exact: true })).toHaveValue('102.5');
  await startFollowing(page, PROGRAM);
  expect(nativeDialogs).toEqual([]);
  await expect.poll(() => activeEnrollmentOf(username)).toMatchObject({ template_version: 2 });
  const today = programToday(page, PROGRAM);
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(['5 × 5 @ 102.5 kg']);
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText([/^4 × /]);

  await openFromProfile(page, 'Programs');
  await ownProgram(page, PROGRAM).getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit program' })).toBeVisible();
  await expect(page.getByText(OUTDATED_TEXT)).toHaveCount(0);

  await openFromProfile(page, 'Programs');
  await ownProgram(page, PROGRAM).getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog', { name: `Delete ${PROGRAM}?`, exact: true });
  await expect(dialog).toContainText("You're following this program. Deleting it stops following it.");
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => activeEnrollmentOf(username)).not.toBeNull();

  await ownProgram(page, PROGRAM).getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(ownProgram(page, PROGRAM)).toHaveCount(0);
  await expect.poll(() => activeEnrollmentOf(username)).toBeNull();
  await openTab(page, 'Train');
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(programToday(page, PROGRAM)).toHaveCount(0);
  await page.goto('/programs/active');
  await expect(page.getByText("You're not following a program.")).toBeVisible();
  expect(nativeDialogs).toEqual([]);
});
