import { expect, type Page, test } from '@playwright/test';
import { openLatestWorkout, openTab, readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf } from './support/db.ts';
import { dayPicker, FIVE_THREE_ONE_ONE_RMS_KG, followProgram, programToday } from './support/program-enrollment.ts';
import { seedFiveThreeOneCycleSkippingPress } from './support/program-seed.ts';

const CYCLE_1_LINES = [
  'Squat training max 90 → 95 kg',
  'Bench press training max 72 → 74.5 kg',
  'Deadlift training max 126 → 131 kg',
];

function cycleSummary(page: Page) {
  return page.getByRole('region', { name: 'Cycle 1 complete', exact: true });
}

async function followAndSeedCycle(page: Page, prefix: string): Promise<void> {
  const username = uniqueUsername(prefix);
  await register(page, username);
  await followProgram(page, '5/3/1', FIVE_THREE_ONE_ONE_RMS_KG);
  const { access_token: accessToken } = await readSession(page);
  await seedFiveThreeOneCycleSkippingPress(accessToken, await activeEnrollmentIdOf(username));
  await page.reload();
  await expect(programToday(page, '5/3/1')).toBeVisible();
}

test('a finished 5/3/1 cycle shows a summary of only the training maxes it changed', async ({ page }) => {
  test.setTimeout(150_000);
  await followAndSeedCycle(page, 'ps_sum');

  const summary = cycleSummary(page);
  await expect(summary).toBeVisible();
  await expect(summary.getByRole('listitem')).toHaveText(CYCLE_1_LINES);
  await expect(summary).not.toContainText('Overhead press');
  await expect(
    dayPicker(programToday(page, '5/3/1')).getByRole('radio', { name: 'C2 W1 Day 1', exact: true }),
  ).toBeChecked();
});

test('a dismissed cycle summary stays dismissed after a reload', async ({ page }) => {
  test.setTimeout(150_000);
  await followAndSeedCycle(page, 'ps_dis');

  await cycleSummary(page).getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(cycleSummary(page)).toHaveCount(0);
  await page.reload();
  await expect(programToday(page, '5/3/1')).toBeVisible();
  await expect(cycleSummary(page)).toHaveCount(0);
});

test('deleting the last workout of the cycle undoes the rollover, so the summary disappears and the day is offered again', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await followAndSeedCycle(page, 'ps_del');
  await expect(cycleSummary(page)).toBeVisible();

  await openLatestWorkout(page);
  await expect(page.getByRole('heading', { name: 'Deadlift', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete workout' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Workout deleted.')).toBeVisible();

  await openTab(page, 'Train');
  const today = programToday(page, '5/3/1');
  await expect(dayPicker(today).getByRole('radio', { name: 'C1 W4 Day 3', exact: true })).toBeChecked();
  await expect(dayPicker(today).getByRole('radio')).toHaveCount(1);
  await expect(cycleSummary(page)).toHaveCount(0);
});
