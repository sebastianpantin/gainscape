import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { openFromProfile, register, uniqueUsername } from './support/app.ts';
import { failRequests, rpc } from './support/network.ts';

const WEEKLY_GOAL_WEEKS = rpc('weekly_goal_weeks');
const SET_WEEKLY_GOAL = rpc('set_weekly_session_goal');

function weeklyGoalSection(page: Page) {
  return page.getByRole('region', { name: 'Weekly goal' });
}

function goalChoice(page: Page, name: string) {
  return weeklyGoalSection(page)
    .getByRole('radiogroup', { name: 'Workouts per week' })
    .getByRole('radio', { name, exact: true });
}

test('a weekly goal that fails to load offers a retry that loads it', async ({ page }) => {
  await failRequests(page, WEEKLY_GOAL_WEEKS);
  await register(page, uniqueUsername('wg_ld'));
  await openFromProfile(page, 'Settings');

  await expect(weeklyGoalSection(page).getByRole('alert')).toHaveText('Could not load your weekly goal.');
  await expect(goalChoice(page, 'Off')).toHaveCount(0);

  await page.unroute(WEEKLY_GOAL_WEEKS);
  await weeklyGoalSection(page).getByRole('button', { name: 'Try again' }).click();
  await expect(goalChoice(page, 'Off')).toHaveAttribute('aria-checked', 'true');
  await expect(goalChoice(page, 'Off')).toBeEnabled();
  await expect(weeklyGoalSection(page).getByRole('alert')).toHaveCount(0);
});

test('a weekly goal that fails to save keeps the old goal and says so', async ({ page }) => {
  await register(page, uniqueUsername('wg_sv'));
  await openFromProfile(page, 'Settings');
  await expect(goalChoice(page, 'Off')).toHaveAttribute('aria-checked', 'true');
  await failRequests(page, SET_WEEKLY_GOAL);

  await goalChoice(page, '3').click();
  await expect(weeklyGoalSection(page).getByRole('alert')).toHaveText('Could not save your weekly goal.');
  await expect(goalChoice(page, 'Off')).toHaveAttribute('aria-checked', 'true');
  await expect(goalChoice(page, '3')).toHaveAttribute('aria-checked', 'false');
  await expect(goalChoice(page, '3')).toBeEnabled();

  await page.unroute(SET_WEEKLY_GOAL);
  await goalChoice(page, '3').click();
  await expect(goalChoice(page, '3')).toHaveAttribute('aria-checked', 'true');
  await expect(weeklyGoalSection(page).getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(goalChoice(page, '3')).toHaveAttribute('aria-checked', 'true');
});
