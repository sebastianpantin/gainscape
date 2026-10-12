import { expect, test } from './support/fixtures.ts';
import { register, uniqueUsername } from './support/app.ts';

test('opening a tab from the keyboard names the page and focuses the screen heading', async ({ page }) => {
  await register(page, uniqueUsername('nav_focus'));
  await expect(page).toHaveTitle('Train · Gainscape');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Skills', exact: true }).focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveTitle('Skills · Gainscape');
  await expect(page.getByRole('heading', { level: 1, name: 'Skills' })).toBeFocused();

  await page.goBack();
  await expect(page).toHaveTitle('Train · Gainscape');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('a deep link names the page without moving focus', async ({ page }) => {
  await register(page, uniqueUsername('nav_title'));

  await page.goto('/profile/settings');

  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page).toHaveTitle('Settings · Gainscape');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).not.toBeFocused();
});

test('opening a screen from a scrolled page starts it at the top', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await register(page, uniqueUsername('nav_scroll'));
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await tabs.getByRole('link', { name: 'Skills', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Skills' })).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await tabs.getByRole('link', { name: 'Profile', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
