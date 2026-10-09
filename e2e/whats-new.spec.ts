import { expect, type Page, test } from '@playwright/test';
import { readChangelog } from '../web/build/changelog.ts';
import { LAST_SEEN_RELEASE_KEY_PREFIX, lastSeenReleaseKey } from '../web/src/lib/last-seen-release-store.ts';
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
const DRAFT_READ_SETTLE_POLL_MS = 250;

interface DraftReads {
  started: number;
  finished: number;
}

function whatsNewDialog(page: Page) {
  return page.getByRole('dialog', { name: "What's new" });
}

async function lastSeenKey(page: Page): Promise<string> {
  return lastSeenReleaseKey((await readSession(page)).user.id);
}

async function storedLastSeen(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), await lastSeenKey(page));
}

async function seedLastSeen(page: Page, version: string) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [await lastSeenKey(page), version]);
}

async function countDraftReads(page: Page, delayMs = 0) {
  await page.addInitScript((delay) => {
    const reads: DraftReads = { started: 0, finished: 0 };
    Object.assign(globalThis, { draftReads: reads });
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<typeof getAll>) {
      reads.started += 1;
      const request = getAll.apply(this, args);
      let handler: ((event: Event) => void) | null = null;
      Object.defineProperty(request, 'onsuccess', {
        configurable: true,
        get: () => handler,
        set: (value: ((event: Event) => void) | null) => {
          handler = value;
        },
      });
      request.addEventListener('success', (event) =>
        setTimeout(() => {
          handler?.call(request, event);
          reads.finished += 1;
        }, delay),
      );
      request.addEventListener('error', () => {
        reads.finished += 1;
      });
      return request;
    };
  }, delayMs);
}

async function waitForDraftChecksToSettle(page: Page) {
  let previous = '';
  await expect
    .poll(
      async () => {
        const reads = await page.evaluate(() => (globalThis as unknown as { draftReads: DraftReads }).draftReads);
        const snapshot = `${reads.started}/${reads.finished}`;
        const settled = reads.started === reads.finished && snapshot === previous;
        previous = snapshot;
        return settled;
      },
      { intervals: [DRAFT_READ_SETTLE_POLL_MS] },
    )
    .toBe(true);
}

async function expectNoDialogNow(page: Page) {
  await waitForDraftChecksToSettle(page);
  await expect(whatsNewDialog(page)).toHaveCount(0);
}

async function expectNoDialogAcrossTabs(page: Page) {
  await openTab(page, 'Skills');
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  await expectNoDialogNow(page);
  await openTab(page, 'Train');
  await expectNoDialogNow(page);
}

async function expectSheetListsEveryRelease(page: Page) {
  await expect(whatsNewDialog(page)).toBeVisible();
  for (const release of RELEASES)
    await expect(whatsNewDialog(page).getByRole('heading', { name: release.title, exact: true })).toBeVisible();
}

async function openReleaseHistory(page: Page) {
  await page.getByRole('main').getByRole('link', { name: "What's new", exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: "What's new" })).toBeVisible();
}

async function expectEveryReleaseInOrder(page: Page) {
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(
    RELEASES.map((release) => release.title),
  );
}

async function logBenchAndFinish(page: Page) {
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await finishWorkout(page);
}

test('Settings shows the newest changelog version', async ({ page }) => {
  await register(page, uniqueUsername('wn_ver'));
  await openFromProfile(page, 'Settings');
  await expect(page.getByText(`Version ${NEWEST_VERSION}`, { exact: true })).toBeVisible();
});

test('a first launch records the current version without a sheet', async ({ page }) => {
  await countDraftReads(page);
  await register(page, uniqueUsername('wn_new'));
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expectNoDialogAcrossTabs(page);
  await expect.poll(() => storedLastSeen(page)).toBe(NEWEST_VERSION);
});

test('an older stored version shows the sheet once until dismissed', async ({ page }) => {
  await countDraftReads(page);
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
  await countDraftReads(page);
  await register(page, uniqueUsername('wn_wkt'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await seedLastSeen(page, '0.0.0');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expectNoDialogNow(page);

  await openTab(page, 'Skills');
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  await expectNoDialogNow(page);
  await openFromProfile(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expectNoDialogNow(page);

  await openTab(page, 'Train');
  await logBenchAndFinish(page);
  await expectNoDialogNow(page);
  await openTab(page, 'Skills');
  await expectSheetListsEveryRelease(page);
});

test('blocked storage writes keep the app usable and the sheet closed', async ({ page }) => {
  await countDraftReads(page);
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
  await openFromProfile(page, 'Settings');
  await openReleaseHistory(page);
  await expectEveryReleaseInOrder(page);
});

test('Settings lists every release, also offline', async ({ context, page }) => {
  await register(page, uniqueUsername('wn_hist'));
  await openFromProfile(page, 'Settings');
  await openReleaseHistory(page);
  await expectEveryReleaseInOrder(page);
  for (const release of RELEASES)
    for (const item of release.items) await expect(page.getByText(item, { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('link', { name: '‹ Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await openReleaseHistory(page);
  await expectEveryReleaseInOrder(page);
  await context.setOffline(false);
});

test('a workout started while the first check runs keeps the sheet away', async ({ page }) => {
  await register(page, uniqueUsername('wn_race'));
  await seedLastSeen(page, '0.0.0');
  await countDraftReads(page, DRAFT_CHECK_DELAY_MS);
  await page.reload();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expectNoDialogNow(page);
  await openTab(page, 'Skills');
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  await openTab(page, 'Train');
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expectNoDialogNow(page);

  await logBenchAndFinish(page);
  await openTab(page, 'Skills');
  await expectSheetListsEveryRelease(page);
});

test('a sheet closed by the browser counts as dismissed', async ({ page }) => {
  await register(page, uniqueUsername('wn_cls'));
  await seedLastSeen(page, '0.0.0');
  await page.reload();
  await expectSheetListsEveryRelease(page);
  await whatsNewDialog(page).evaluate((dialog: HTMLDialogElement) => dialog.close());
  await expect.poll(() => storedLastSeen(page)).toBe(NEWEST_VERSION);
  await expect(whatsNewDialog(page)).toHaveCount(0);
});
