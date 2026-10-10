import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { expectNoAxeViolations } from '../support/a11y.ts';
import {
  exerciseCard,
  logExercise,
  openFromProfile,
  openTab,
  readSession,
  register,
  setRow,
  uniqueUsername,
} from '../support/app.ts';
import {
  builtShell,
  cachedPaths,
  replaceBuildId,
  restoreServiceWorker,
  serviceWorkerPath,
  swapServiceWorker,
  UPDATE_READY,
  waitForController,
} from '../support/pwa.ts';
import { finishLockName } from '../../web/src/offline/finish-lock.ts';
import { KILL_SWITCH_ALLOW_LOCAL_FLAG } from '../../web/build/service-worker-plugin.ts';
import { SHELL_CACHE_PREFIX, shellCacheName } from '../../web/src/pwa/shell-rules.ts';

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
  const firstSet = setRow(exerciseCard(page, 'Barbell Bench Press'), 1);
  await expect(firstSet.getByRole('spinbutton', { name: 'kg', exact: true })).toHaveValue('60');
  await expect(firstSet.getByLabel('reps')).toHaveValue('5');
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
  await expectNoAxeViolations(page, 'update banner');

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
  let lockReleased = false;
  const navigationsBeforeRelease: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && !lockReleased) navigationsBeforeRelease.push(frame.url());
  });
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByText('Saving your workout first…')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async (name) => (await navigator.locks.query()).pending?.some((lock) => lock.name === name),
        lockName,
      ),
    )
    .toBe(true);
  expect(await timeOrigin(page)).toBe(pageBefore);

  lockReleased = true;
  await other.evaluate(() => (window as Window & { releaseFinishLock?: () => void }).releaseFinishLock?.());
  await expect.poll(() => timeOrigin(page).catch(() => pageBefore), { timeout: 30_000 }).not.toBe(pageBefore);
  expect(navigationsBeforeRelease).toEqual([]);
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
  await expect(page.getByText("Couldn't download the update. Try again later.")).toBeVisible();
  expect((await cachedPaths(page)).map((cache) => cache.cacheName)).toEqual([shellCacheName(oldId)]);
});

test('the kill switch retires the worker and reloads the page without a click', async ({ page }) => {
  const shellWorker = readFileSync(serviceWorkerPath, 'utf8');
  execFileSync('node', [join(import.meta.dirname, '../../scripts/build-kill-switch.ts')], {
    env: { ...process.env, [KILL_SWITCH_ALLOW_LOCAL_FLAG]: '1' },
    stdio: 'ignore',
  });
  const killSwitch = swapServiceWorker(shellWorker);
  await register(page, uniqueUsername('pwa_k'));
  await waitForController(page);
  const before = await timeOrigin(page);

  originalWorker = swapServiceWorker(killSwitch);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((registration) => registration?.update()));
  await expect.poll(() => timeOrigin(page).catch(() => before), { timeout: 30_000 }).not.toBe(before);
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect((await cachedPaths(page)).filter((cache) => cache.cacheName.startsWith(SHELL_CACHE_PREFIX))).toEqual([]);
});

test('checking for updates without a new version says the app is up to date', async ({ page }) => {
  await register(page, uniqueUsername('pwa_n'));
  await waitForController(page);

  await openFromProfile(page, 'Settings');
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByRole('status').filter({ hasText: "You're up to date." })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  await expect(page.getByText(UPDATE_READY)).toHaveCount(0);
  expect((await cachedPaths(page)).map((cache) => cache.cacheName)).toEqual([shellCacheName(builtShell().id)]);
});
