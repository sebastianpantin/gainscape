import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  exerciseCard,
  logExercise,
  openFromProfile,
  openTab,
  register,
  restTimer,
  uniqueUsername,
} from './support/app.ts';

declare global {
  interface Window {
    permissionRequests: number;
  }
}

async function runAsInstalledAppThatHasNotAsked(page: Page) {
  await page.addInitScript(() => {
    window.permissionRequests = 0;
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query === '(display-mode: standalone)'
        ? ({ ...matchMedia(query), matches: true } as MediaQueryList)
        : matchMedia(query);
    const notification = {
      permission: 'default' as NotificationPermission,
      requestPermission: () => {
        window.permissionRequests += 1;
        notification.permission = 'granted';
        return Promise.resolve('granted');
      },
    };
    Object.defineProperty(window, 'Notification', { configurable: true, value: notification });
  });
}

function notifyPrompt(page: Page) {
  return page.getByRole('region', { name: 'Rest notifications' });
}

async function startRest(page: Page, setNumber: number) {
  const bench = exerciseCard(page, 'Barbell Bench Press');
  if (setNumber === 1) await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  else {
    await bench.getByRole('button', { name: '+ Add set' }).click();
    await bench.getByRole('button', { name: `Done set ${setNumber}` }).click();
  }
  await expect(restTimer(page)).toBeVisible();
}

test('the installed app offers rest notifications on the first rest and turns them on from there', async ({ page }) => {
  await runAsInstalledAppThatHasNotAsked(page);
  await register(page, uniqueUsername('np'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(notifyPrompt(page)).toHaveCount(0);

  await startRest(page, 1);
  await expect(notifyPrompt(page)).toContainText('Get a buzz when rest ends, even with the screen locked?');
  await notifyPrompt(page).getByRole('button', { name: 'Turn on' }).click();
  await expect(notifyPrompt(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.permissionRequests)).toBe(1);

  await openTab(page, 'Profile');
  await openFromProfile(page, 'Settings');
  await expect(
    page
      .getByRole('radiogroup', { name: 'Notify when rest ends in the background' })
      .getByRole('radio', { name: 'On' }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('not now hides the notification offer for good', async ({ page }) => {
  await runAsInstalledAppThatHasNotAsked(page);
  await register(page, uniqueUsername('nn'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await startRest(page, 1);
  await notifyPrompt(page).getByRole('button', { name: 'Not now' }).click();
  await expect(notifyPrompt(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeFocused();

  await page.reload();
  await startRest(page, 2);
  await expect(notifyPrompt(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.permissionRequests)).toBe(0);
});

test('a browser tab never offers rest notifications during a rest', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission: () => Promise.resolve('default') },
    }),
  );
  await register(page, uniqueUsername('nb'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await startRest(page, 1);
  await expect(notifyPrompt(page)).toHaveCount(0);
});
