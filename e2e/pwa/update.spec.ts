import { expect, type Page, test } from '@playwright/test';
import { logExercise, openFromProfile, openTab, readSession, register } from '../support/app.ts';
import {
  builtShell,
  cachedPaths,
  replaceBuildId,
  restoreServiceWorker,
  uniqueUsername,
  UPDATE_READY,
  waitForController,
} from '../support/pwa.ts';
import { finishLockName } from '../../web/src/offline/finish-lock.ts';
import { shellCacheName } from '../../web/src/pwa/shell-rules.ts';

let originalWorker: string | null = null;

test.afterEach(() => {
  if (originalWorker !== null) restoreServiceWorker(originalWorker);
  originalWorker = null;
});

function timeOrigin(page: Page): Promise<number> {
  return page.evaluate(() => performance.timeOrigin);
}

async function expectDraftWithSet(page: Page) {
  await openTab(page, 'Train');
  const card = page.locator('section', {
    has: page.getByRole('heading', { name: 'Barbell Bench Press', exact: true }),
  });
  await expect(card.getByLabel(/kg/)).toHaveValue('60');
  await expect(card.getByLabel('reps')).toHaveValue('5');
}

test('a new version reloads safely', async ({ context, page }) => {
  test.setTimeout(180_000);
  const oldId = builtShell().id;
  const newId = [...oldId].map((digit) => (15 - parseInt(digit, 16)).toString(16)).join('');
  const username = uniqueUsername('pwa_u');
  await register(page, username);
  await waitForController(page);
  await expect(page.getByText(UPDATE_READY)).toHaveCount(0);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  const { user } = await readSession(page);

  originalWorker = replaceBuildId(oldId, newId);
  await openFromProfile(page, 'Settings');
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText(UPDATE_READY)).toBeVisible({ timeout: 30_000 });

  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('link', { name: 'Train', exact: true })).toBeVisible();
  const lockName = finishLockName(user.id);
  await other.evaluate((name) => {
    const holder = window as Window & { releaseFinishLock?: () => void };
    void navigator.locks.request(
      name,
      () =>
        new Promise<void>((resolve) => {
          holder.releaseFinishLock = resolve;
        }),
    );
  }, lockName);
  await expect
    .poll(() =>
      other.evaluate(
        async (name) => (await navigator.locks.query()).held?.some((lock) => lock.name === name),
        lockName,
      ),
    )
    .toBe(true);

  const pageBefore = await timeOrigin(page);
  const otherBefore = await timeOrigin(other);
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByText('Saving your workout first…')).toBeVisible();
  await page.waitForTimeout(2000);
  expect(await timeOrigin(page)).toBe(pageBefore);

  await other.evaluate(() => (window as Window & { releaseFinishLock?: () => void }).releaseFinishLock?.());
  await expect.poll(() => timeOrigin(page).catch(() => pageBefore), { timeout: 30_000 }).not.toBe(pageBefore);
  await expect.poll(() => timeOrigin(other).catch(() => otherBefore), { timeout: 30_000 }).not.toBe(otherBefore);
  await expectDraftWithSet(page);
  await expectDraftWithSet(other);

  expect((await cachedPaths(page)).map((cache) => cache.cacheName)).toEqual([shellCacheName(newId)]);
});

test('a new version whose files do not match their hashes never replaces the shell', async ({ page }) => {
  const shell = builtShell();
  const oldId = shell.id;
  const newId = [...oldId].map((digit) => (15 - parseInt(digit, 16)).toString(16)).join('');
  const index = shell.files.find((file) => file.path === '/index.html')!;
  await register(page, uniqueUsername('pwa_h'));
  await waitForController(page);

  originalWorker = replaceBuildId(oldId, newId);
  replaceBuildId(index.sha256, '0'.repeat(index.sha256.length));
  await openFromProfile(page, 'Settings');
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return { installing: registration?.installing !== null, waiting: registration?.waiting !== null };
      }),
    )
    .toEqual({ installing: false, waiting: false });
  await expect(page.getByText(UPDATE_READY)).toHaveCount(0);
  expect((await cachedPaths(page)).map((cache) => cache.cacheName)).toEqual([shellCacheName(oldId)]);
});
