import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { expectNoAxeViolations } from './support/a11y.ts';
import { logBench, openTab, register, uniqueUsername } from './support/app.ts';

test.use({ viewport: { width: 360, height: 780 } });

function thisWeek(page: Page) {
  return page.getByRole('region', { name: 'This week' });
}

function weekStrip(page: Page) {
  return thisWeek(page).getByRole('link', { name: /^This week: .*\. Open Stats$/ });
}

function todayName(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long' });
}

test('the week strip lights today after a workout, opens Stats and stays offline', async ({ page, context }) => {
  await register(page, uniqueUsername('home_week'));
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeInViewport();
  await expect(weekStrip(page)).toHaveAccessibleName('This week: no workouts yet. Open Stats');
  await expect(thisWeek(page)).toContainText('0 workouts this week');
  await expectNoAxeViolations(page, 'train home, new');

  await logBench(page);
  await openTab(page, 'Train');
  await expect(weekStrip(page)).toHaveAccessibleName(
    new RegExp(`^This week: trained (.+ )?${todayName()}\\. Open Stats$`),
  );
  await expect(weekStrip(page).locator('.week-day.today.trained')).toHaveCount(1);
  await expect(thisWeek(page)).toContainText('1 workout this week');
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeInViewport();
  await expectNoAxeViolations(page, 'train home, trained');

  await weekStrip(page).click();
  await expect(page).toHaveURL(/\/collection\/stats$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Stats', exact: true })).toBeVisible();

  await context.setOffline(true);
  await openTab(page, 'Train');
  await expect(weekStrip(page).locator('.week-day.today.trained')).toHaveCount(1);
  await context.setOffline(false);
});
