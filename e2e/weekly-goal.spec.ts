import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { logBench, openFromProfile, openTab, register, uniqueUsername } from './support/app.ts';

function weeklyGoalCard(page: Page) {
  return page.getByRole('region', { name: 'This week' });
}

function levelNudge(page: Page) {
  return page.getByRole('link', { name: /^\w[\w ]* is [\d,]+ XP from level \d+$/ });
}

function goalChoice(page: Page, name: string) {
  return page.getByRole('radiogroup', { name: 'Workouts per week' }).getByRole('radio', { name, exact: true });
}

test('a weekly goal counts workouts on Today and a change waits for next week', async ({ page }) => {
  await register(page, uniqueUsername('goal'));
  await expect(page.getByRole('heading', { level: 1, name: 'Train', exact: true })).toBeVisible();
  await expect(weeklyGoalCard(page)).toContainText('0 workouts this week');
  await expect(weeklyGoalCard(page)).not.toContainText('streak');
  await expect(levelNudge(page)).toHaveCount(0);

  await openFromProfile(page, 'Settings');
  await expect(goalChoice(page, 'Off')).toHaveAttribute('aria-checked', 'true');
  await goalChoice(page, '2').click();
  await expect(goalChoice(page, '2')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('A change starts next Monday, so this week keeps its goal of 2.')).toBeVisible();

  await openTab(page, 'Train');
  await expect(weeklyGoalCard(page)).toContainText('0 of 2 workouts this week');
  await expect(weeklyGoalCard(page)).toContainText('No streak yet');

  await logBench(page);
  await openTab(page, 'Train');
  await expect(weeklyGoalCard(page)).toContainText('1 of 2 workouts this week');
  await expect(levelNudge(page)).toBeVisible();

  await logBench(page);
  await openTab(page, 'Train');
  await expect(weeklyGoalCard(page)).toContainText('Goal met: 2 of 2 workouts this week');
  await expect(weeklyGoalCard(page)).toContainText('1 week streak');

  await openFromProfile(page, 'Settings');
  await goalChoice(page, '3').click();
  await expect(goalChoice(page, '3')).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByText(/^Your goal of 3 starts on \w{3},? \d{1,2} \w{3}\. This week keeps its goal of 2\.$/),
  ).toBeVisible();

  await openTab(page, 'Train');
  await expect(weeklyGoalCard(page)).toContainText('Goal met: 2 of 2 workouts this week');
});
