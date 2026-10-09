import { expect, type Page, test } from '@playwright/test';
import { readChangelog } from '../web/build/changelog.ts';
import { LAST_SEEN_RELEASE_KEY_PREFIX } from '../web/src/lib/last-seen-release-store.ts';
import { expectNoAxeViolations, expectTouchTargets } from './support/a11y.ts';
import {
  finishWorkout,
  logExercise,
  openFromProfile,
  openTab,
  readSession,
  register,
  uniqueUsername,
} from './support/app.ts';

const RELEASES = readChangelog();
const NEWEST_VERSION = RELEASES[0].version;
const DRAFT_CHECK_DELAY_MS = 1_500;

function whatsNewDialog(page: Page) {
  return page.getByRole('dialog', { name: "What's new" });
}

async function lastSeenKey(page: Page): Promise<string> {
  return `${LAST_SEEN_RELEASE_KEY_PREFIX}${(await readSession(page)).user.id}`;
}

async function storedLastSeen(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), await lastSeenKey(page));
}

async function seedLastSeen(page: Page, version: string) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [await lastSeenKey(page), version]);
}

async function expectNoDialogAcrossTabs(page: Page) {
  await openTab(page, 'Skills');
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  await openTab(page, 'Train');
  await expect(whatsNewDialog(page)).toHaveCount(0);
}

async function expectSheetListsEveryRelease(page: Page) {
  await expect(whatsNewDialog(page)).toBeVisible();
  for (const release of RELEASES)
    await expect(whatsNewDialog(page).getByRole('heading', { name: release.title, exact: true })).toBeVisible();
}

async function logBenchAndFinish(page: Page) {
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await finishWorkout(page);
}

async function delayDraftChecks(page: Page) {
  await page.addInitScript((delayMs) => {
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<typeof getAll>) {
      const request = getAll.apply(this, args);
      let handler: ((event: Event) => void) | null = null;
      Object.defineProperty(request, 'onsuccess', {
        configurable: true,
        get: () => handler,
        set: (value: ((event: Event) => void) | null) => {
          handler = value;
        },
      });
      request.addEventListener('success', (event) => setTimeout(() => handler?.call(request, event), delayMs));
      return request;
    };
  }, DRAFT_CHECK_DELAY_MS);
}

test('Settings shows the newest changelog version', async ({ page }) => {
  await register(page, uniqueUsername('wn_ver'));
  await openFromProfile(page, 'Settings');
  await expect(page.getByText(`Version ${NEWEST_VERSION}`, { exact: true })).toBeVisible();
});

test('a first launch records the current version without a sheet', async ({ page }) => {
  await register(page, uniqueUsername('wn_new'));
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expectNoDialogAcrossTabs(page);
  await expect.poll(() => storedLastSeen(page)).toBe(NEWEST_VERSION);
});

test('an older stored version shows the sheet once until dismissed', async ({ page }) => {
  await register(page, uniqueUsername('wn_old'));
  await seedLastSeen(page, '0.0.0');
  await page.reload();
  await expectSheetListsEveryRelease(page);
  await expectNoAxeViolations(page, 'whats new sheet');
  await expectTouchTargets(page, ['.whats-new-dialog button']);

  await whatsNewDialog(page).getByRole('button', { name: 'Got it' }).click();
  await expect(whatsNewDialog(page)).toHaveCount(0);
  expect(await storedLastSeen(page)).toBe(NEWEST_VERSION);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expectNoDialogAcrossTabs(page);

  await seedLastSeen(page, '0.0.0');
  await page.reload();
  await expectSheetListsEveryRelease(page);
  await page.keyboard.press('Escape');
  await expect(whatsNewDialog(page)).toHaveCount(0);
  expect(await storedLastSeen(page)).toBe(NEWEST_VERSION);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expectNoDialogAcrossTabs(page);
});

test('the sheet waits for the workout to finish and skips the reveal', async ({ page }) => {
  await register(page, uniqueUsername('wn_wkt'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await seedLastSeen(page, '0.0.0');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expect(whatsNewDialog(page)).toHaveCount(0);

  await openTab(page, 'Skills');
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  await expect(whatsNewDialog(page)).toHaveCount(0);
  await openFromProfile(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(whatsNewDialog(page)).toHaveCount(0);

  await openTab(page, 'Train');
  await logBenchAndFinish(page);
  await expect(whatsNewDialog(page)).toHaveCount(0);
  await openTab(page, 'Skills');
  await expectSheetListsEveryRelease(page);
});

test('blocked storage writes keep the app usable and the sheet closed', async ({ page }) => {
  await register(page, uniqueUsername('wn_blk'));
  await seedLastSeen(page, '0.0.0');
  await page.addInitScript((prefix) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith(prefix)) throw new DOMException('blocked', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
  }, LAST_SEEN_RELEASE_KEY_PREFIX);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expectNoDialogAcrossTabs(page);
});

test('a workout started while the first check runs keeps the sheet away', async ({ page }) => {
  await register(page, uniqueUsername('wn_race'));
  await seedLastSeen(page, '0.0.0');
  await delayDraftChecks(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await page.waitForTimeout(DRAFT_CHECK_DELAY_MS * 3);
  await expect(whatsNewDialog(page)).toHaveCount(0);
  await openTab(page, 'Skills');
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  await openTab(page, 'Train');
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expect(whatsNewDialog(page)).toHaveCount(0);

  await logBenchAndFinish(page);
  await openTab(page, 'Skills');
  await expectSheetListsEveryRelease(page);
});
