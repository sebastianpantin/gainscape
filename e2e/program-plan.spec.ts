import { expect, type Page, test } from '@playwright/test';
import { readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, skipProgramDayElsewhere } from './support/db.ts';
import {
  FIVE_THREE_ONE_ONE_RMS_KG,
  followProgram,
  MADCOW_FIVE_RMS_KG,
  prescribedRows,
  programToday,
} from './support/program-enrollment.ts';
import { postFiveThreeOneSession } from './support/program-seed.ts';

const PLAN_PATH = '/programs/active/plan';

function planDay(page: Page, label: string) {
  return page.getByRole('region', { name: label, exact: true });
}

async function openPlanFromManage(page: Page, programName: string): Promise<void> {
  await programToday(page, programName).getByRole('link', { name: 'Manage program', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: programName, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'See the plan', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${PLAN_PATH}$`));
  await expect(page.getByRole('heading', { level: 1, name: `${programName} plan`, exact: true })).toBeVisible();
}

test('the Madcow plan lists the days of the current week with their rows, a skipped day marked "Skipped"', async ({
  page,
}) => {
  const username = uniqueUsername('pp_mc');
  await register(page, username);
  await followProgram(page, 'Madcow 5x5', MADCOW_FIVE_RMS_KG);
  await skipProgramDayElsewhere(await activeEnrollmentIdOf(username), { week: 1, day: 'mon' });
  await page.reload();
  await openPlanFromManage(page, 'Madcow 5x5');

  await expect(page.getByRole('heading', { level: 2, name: 'Week 1', exact: true })).toBeVisible();
  const monday = planDay(page, 'W1 Monday');
  await expect(monday.getByText('Skipped', { exact: true })).toBeVisible();
  await expect(monday.getByRole('list')).toHaveCount(0);

  const wednesday = planDay(page, 'W1 Wednesday');
  await expect(prescribedRows(wednesday, 'Back Squat')).toHaveText([
    '47.5 kg × 5 · 50%',
    '57.5 kg × 5 · 62.5%',
    '70 kg × 5 · 75%',
    '70 kg × 5 · 75%',
  ]);
  await expect(wednesday.getByText('Skipped', { exact: true })).toHaveCount(0);
  await expect(wednesday.getByText('Done', { exact: true })).toHaveCount(0);

  await expect(prescribedRows(planDay(page, 'W1 Friday'), 'Back Squat')).toHaveText([
    '47.5 kg × 5 · 50%',
    '57.5 kg × 5 · 62.5%',
    '70 kg × 5 · 75%',
    '80 kg × 5 · 87.5%',
    '95 kg × 3 · 102.5%',
    '70 kg × 8 · 75%',
  ]);
});

test('the 5/3/1 plan lists the whole cycle and marks a logged day "Done"', async ({ page }) => {
  const username = uniqueUsername('pp_531');
  await register(page, username);
  await followProgram(page, '5/3/1', FIVE_THREE_ONE_ONE_RMS_KG);
  const { access_token: accessToken } = await readSession(page);
  await postFiveThreeOneSession(accessToken, {
    enrollmentId: await activeEnrollmentIdOf(username),
    week: 1,
    lift: 'squat',
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });

  await page.goto(PLAN_PATH);
  await expect(page.getByRole('heading', { level: 1, name: '5/3/1 plan', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Cycle 1', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: /^C1 W[1-4] / })).toHaveCount(16);

  const squatDay = planDay(page, 'C1 W1 Squat');
  await expect(squatDay.getByText('Done', { exact: true })).toBeVisible();
  await expect(squatDay.getByRole('list')).toHaveCount(0);

  await expect(prescribedRows(planDay(page, 'C1 W1 Bench press'), 'Barbell Bench Press')).toHaveText([
    '47.5 kg × 5 · 65%',
    '55 kg × 5 · 75%',
    '60 kg × 5+ · 85%',
  ]);
  await expect(prescribedRows(planDay(page, 'C1 W3 Squat'), 'Back Squat')).toHaveText([
    '67.5 kg × 5 · 75%',
    '77.5 kg × 3 · 85%',
    '85 kg × 1+ · 95%',
  ]);
});
