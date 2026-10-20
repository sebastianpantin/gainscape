import { expect, test } from './support/fixtures.ts';
import { expectNoAxeViolations } from './support/a11y.ts';
import { logBench, openTab, register, uniqueUsername } from './support/app.ts';

test('Stats opens from Collection, names the page, keeps Collection lit and leads back', async ({ page }) => {
  await register(page, uniqueUsername('stats_nav'));
  await openTab(page, 'Collection');

  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  await expect(page).toHaveURL(/\/collection\/stats$/);
  await expect(page).toHaveTitle('Stats · Gainscape');
  await expect(page.getByRole('heading', { level: 1, name: 'Stats', exact: true })).toBeFocused();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Collection', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expectNoAxeViolations(page, 'stats');

  await page.getByRole('main').getByRole('link', { name: '‹ Collection', exact: true }).click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Collection: Records', exact: true })).toBeVisible();
});

function monthTitleOf(monthsAgo: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

test('the calendar lights today after a workout and the month compare counts it, offline too', async ({
  page,
  context,
}) => {
  await register(page, uniqueUsername('stats_cal'));
  await logBench(page);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  const calendar = page.getByRole('table', { name: monthTitleOf(0), exact: true });
  const today = calendar.locator('td[aria-current="date"]');
  await expect(today).toHaveText(/: 1 workout, [\d,]+ XP$/);
  await expect(today).toHaveClass(/heat-4/);
  await expect(calendar.getByRole('cell', { name: /: no workout$/ }).first()).toBeVisible();

  const compare = page.getByRole('table', { name: `${monthTitleOf(0)} compared with ${monthTitleOf(1)}` });
  await expect(compare.getByRole('row', { name: /^Workouts/ })).toHaveText(/Workouts10\+1/);
  await expect(compare.getByRole('row', { name: /^Volume/ })).toHaveText('Volume300 kg0 kg+300 kg');
  await expectNoAxeViolations(page, 'stats calendar');

  const next = page.getByRole('button', { name: 'Next month', exact: true });
  await expect(next).toBeDisabled();
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page.getByRole('table', { name: monthTitleOf(1), exact: true })).toBeVisible();
  await expect(
    page.getByRole('table', { name: monthTitleOf(1), exact: true }).locator('td.heat-1, td.heat-4'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('table', { name: `${monthTitleOf(1)} compared with ${monthTitleOf(2)}` }).getByRole('row', {
      name: /^Workouts/,
    }),
  ).toHaveText('Workouts00No change');
  await expect(next).toBeEnabled();
  await next.click();
  await expect(calendar).toBeVisible();

  await context.setOffline(true);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();
  await expect(page.getByRole('main').getByText('Offline: showing your saved stats.', { exact: true })).toBeVisible();
  await expect(today).toHaveText(/: 1 workout, [\d,]+ XP$/);
  await context.setOffline(false);
});

function thisWeekLabel(): string {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

test('volume history charts this week of the trained muscle and switches muscle', async ({ page }) => {
  await register(page, uniqueUsername('stats_vol'));
  await logBench(page);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  const history = page.getByRole('region', { name: 'Volume history', exact: true });
  const muscle = history.getByRole('combobox', { name: 'Muscle', exact: true });
  await expect(muscle).toHaveValue('chest');
  await expect(history.getByRole('img', { name: /^Chest working sets per week\. / })).toHaveAccessibleName(
    new RegExp(`, ${thisWeekLabel()} 0\\.7\\.$`),
  );
  await expect(history.getByText('This week: 0.7 of 10 sets', { exact: true })).toBeVisible();
  await expect(history.getByText(/target is 10 to 20 sets a week per muscle/)).toBeVisible();
  await expectNoAxeViolations(page, 'stats volume history');

  await muscle.selectOption({ label: 'Legs' });
  await expect(history.getByRole('img', { name: /^Legs working sets per week\. / })).toBeVisible();
  await expect(history.getByText('This week: 0 of 10 sets', { exact: true })).toBeVisible();
});
