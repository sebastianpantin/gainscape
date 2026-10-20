import { expect, test } from './support/fixtures.ts';
import { expectNoAxeViolations } from './support/a11y.ts';
import { openTab, register, uniqueUsername } from './support/app.ts';

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
