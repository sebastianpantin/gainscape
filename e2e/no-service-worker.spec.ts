import { expect, test } from '@playwright/test';
import { register, uniqueUsername } from './support/app.ts';
import { expectFontsLoaded } from './support/fonts.ts';

test.use({ serviceWorkers: 'allow' });

type CountingWindow = Window & { serviceWorkerRegistrations?: number };

test('the dev server never registers a service worker and still loads the fonts', async ({ page }) => {
  await page.addInitScript(() => {
    const counting = window as CountingWindow;
    counting.serviceWorkerRegistrations = 0;
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...args) => {
      counting.serviceWorkerRegistrations = (counting.serviceWorkerRegistrations ?? 0) + 1;
      return register(...args);
    };
  });
  await register(page, uniqueUsername('nosw'));
  await page.reload();
  await page.waitForLoadState('load');
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expectFontsLoaded(page);
  expect(await page.evaluate(() => (window as CountingWindow).serviceWorkerRegistrations)).toBe(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});
