import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { finishWorkout, openFromProfile, openTab, register, setRow, uniqueUsername } from './support/app.ts';
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
    await setRow(bench, setNumber).getByRole('spinbutton', { name: 'kg', exact: true }).fill(String(benchKg));
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
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(repeated('100 kg × 5 · 100%', 5));

  await logSessionWithBenchAt(page, 'Session 1 Day 1', 60);
  await expect.poll(() => weightsIn(workoutCards(page, 'Back Squat'))).toEqual(repeated('100', 5));
  await markEverySetDone(page);
  await finishAndReturn(page);

  const afterMet = programToday(page, PROGRAM);
  await expect(dayPicker(afterMet).getByRole('radio', { name: 'Session 2 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(afterMet, 'Back Squat')).toHaveText(repeated('102.5 kg × 5 · 100%', 5));

  await context.setOffline(true);
  await openTab(page, 'Profile');
  await openTab(page, 'Train');
  await logSessionWithBenchAt(page, 'Session 2 Day 1', 60);
  await expect.poll(() => weightsIn(workoutCards(page, 'Back Squat'))).toEqual(repeated('102.5', 5));
  await setRow(workoutCards(page, 'Back Squat'), 5).getByRole('spinbutton', { name: 'reps', exact: true }).fill('3');
  await markEverySetDone(page);
  await context.setOffline(false);
  await finishAndReturn(page);

  const afterMiss = programToday(page, PROGRAM);
  await expect(dayPicker(afterMiss).getByRole('radio', { name: 'Session 3 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(afterMiss, 'Back Squat')).toHaveText(repeated('102.5 kg × 5 · 100%', 5));
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
