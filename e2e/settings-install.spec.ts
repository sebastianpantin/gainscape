import { devices, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { logBench, openFromProfile, openTab, register, uniqueUsername } from './support/app.ts';

test.use({ userAgent: devices['Pixel 7'].userAgent });

type InstallPromptWindow = Window & { installPromptCalls?: number };

async function offerInstall(page: Page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        const holder = window as InstallPromptWindow;
        holder.installPromptCalls = (holder.installPromptCalls ?? 0) + 1;
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });
    window.dispatchEvent(event);
  });
}

function installPromptCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as InstallPromptWindow).installPromptCalls ?? 0);
}

function installCard(page: Page) {
  return page.getByRole('region', { name: 'Install Gainscape' });
}

test('Settings offers to install once the browser allows it and opens the browser prompt', async ({ page }) => {
  await register(page, uniqueUsername('in_st'));
  await openFromProfile(page, 'Settings');
  const install = page.getByRole('button', { name: 'Install Gainscape' });
  await expect(page.getByRole('heading', { name: 'App' })).toBeVisible();
  await expect(install).toHaveCount(0);

  await offerInstall(page);
  await install.click();
  await expect.poll(() => installPromptCalls(page)).toBe(1);
  await expect(install).toHaveCount(0);
});

test('the Train install card waits for a first workout, installs, and stays dismissed', async ({ page }) => {
  await register(page, uniqueUsername('in_tr'));
  await offerInstall(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(installCard(page)).toHaveCount(0);

  await logBench(page);
  await openTab(page, 'Train');
  await expect(installCard(page)).toContainText('Install Gainscape so your workouts load without signal.');
  await installCard(page).getByRole('button', { name: 'Install Gainscape' }).click();
  await expect.poll(() => installPromptCalls(page)).toBe(1);
  await expect(installCard(page)).toHaveCount(0);

  await offerInstall(page);
  await expect(installCard(page)).toBeVisible();
  await installCard(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(installCard(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await offerInstall(page);
  await openFromProfile(page, 'Settings');
  await expect(page.getByRole('button', { name: 'Install Gainscape' })).toBeVisible();
  await openTab(page, 'Train');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(installCard(page)).toHaveCount(0);
});
