import { expect, type Page, test } from '@playwright/test';
import {
  authStorageKey,
  logExercise,
  nowInSeconds,
  openFromProfile,
  openTab,
  readSession,
  readStoredDraft,
  register,
  type Tab,
  uniqueUsername,
  writeSession,
} from '../support/app.ts';
import {
  expectDeadliftPrefill,
  logDeadliftToFailure,
  OFFLINE_ITEMS_NOTICE,
  openItems,
  SCROLL_KEY,
  scrollSlot,
  startChallenge,
} from '../support/challenge.ts';
import { grantItems, sessionCount, setCount } from '../support/db.ts';
import { expectNoAxeViolations } from '../support/a11y.ts';
import { expectFontsLoaded } from '../support/fonts.ts';
import { readChangelog } from '../../web/build/changelog.ts';
import {
  builtShell,
  cachedPaths,
  fetchOutcome,
  markPageOffline,
  OFFLINE_BANNER,
  waitForController,
} from '../support/pwa.ts';

const OFFLINE_TAB_BUDGET_MS = 3_000;
const OFFLINE_SKILLS_NOTICE = 'Offline: using your saved skills.';
const OFFLINE_COLLECTION_NOTICE = 'Offline: using your saved collection log.';
const OFFLINE_PROFILE_NOTICE = 'Offline: using your saved profile.';
const OFFLINE_PROGRAMS_NOTICE = 'Offline: using your saved programs.';

function noteOpenTime(screen: string, started: number) {
  test.info().annotations.push({ type: 'offline open', description: `${screen}: ${Date.now() - started} ms` });
}

async function expectProvenOffline(page: Page) {
  expect(await fetchOutcome(page, '/sb/rest/v1/')).toBe('rejected');
  expect(await fetchOutcome(page, '/not-precached.txt')).toBe('rejected');
}

test('an installed shell cold-starts offline and syncs later', async ({ context, page }) => {
  test.setTimeout(240_000);
  const username = uniqueUsername('pwa_a');
  await register(page, username);
  await waitForController(page);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  const { user } = await readSession(page);
  await expect.poll(async () => (await readStoredDraft(page, user.id))?.kind).toBe('draft');
  const sessionId = (await readStoredDraft(page, user.id))!.draft!.sessionId;

  await context.setOffline(true);
  await writeSession(page, { expires_at: nowInSeconds() - 60 });
  await expectProvenOffline(page);
  await page.close();

  const cold = await context.newPage();
  const response = await cold.goto('/');
  expect(response?.fromServiceWorker()).toBe(true);
  const markOnline = await markPageOffline(cold);
  await expectProvenOffline(cold);
  await expect(cold.getByText(OFFLINE_BANNER)).toBeVisible();
  await expectNoAxeViolations(cold, 'offline banner');
  const benchCard = cold.locator('section', {
    has: cold.getByRole('heading', { name: 'Barbell Bench Press', exact: true }),
  });
  await expect(benchCard).toBeVisible();
  await expect(cold.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expect(benchCard.locator('li.set-row').getByRole('spinbutton', { name: 'kg', exact: true })).toHaveValue('60');
  await expect(benchCard.locator('li.set-row').getByLabel('reps')).toHaveValue('5');
  expect((await readSession(cold)).expires_at).toBeLessThan(nowInSeconds());
  await expectFontsLoaded(cold);

  await cold.getByLabel('Search exercises').fill('squat');
  await expect(cold.getByRole('button', { name: /^Back Squat\b/ })).toContainText('Legs · Core');
  await logExercise(cold, 'squat', 'Back Squat', [{ weightKg: 80, reps: 5 }]);
  await cold.getByRole('button', { name: 'Finish workout' }).click();
  await expect(cold.getByText(/Couldn't reach the server/)).toBeVisible({ timeout: 60_000 });

  await markOnline();
  await context.setOffline(false);
  await expect(cold.getByRole('heading', { name: 'Workout complete!' })).toBeVisible({ timeout: 90_000 });
  expect(await sessionCount(username)).toBe(1);
  expect(await setCount(sessionId)).toBe(2);
});

test('the items tab reloads offline from its saved items and starts a challenge with the cached e1RM', async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const username = uniqueUsername('pwa_ch');
  await register(page, username);
  await waitForController(page);
  await logDeadliftToFailure(page, 140);
  await grantItems(username, { [SCROLL_KEY]: 1 });
  await openItems(page);
  await expect(scrollSlot(page)).toBeVisible();

  await context.setOffline(true);
  expect((await page.reload())?.fromServiceWorker()).toBe(true);
  const markOnline = await markPageOffline(page);
  await expectProvenOffline(page);
  await expect(page.getByText(OFFLINE_ITEMS_NOTICE)).toBeVisible({ timeout: 60_000 });

  await startChallenge(page);
  await expectDeadliftPrefill(page, 100);
  await markOnline();
  await context.setOffline(false);
});

test('the worker never stores or answers Supabase traffic', async ({ context, page, baseURL }) => {
  test.setTimeout(180_000);
  const requests: string[] = [];
  context.on('request', (request) => requests.push(request.url()));
  const username = uniqueUsername('pwa_b');
  await register(page, username);
  await waitForController(page);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible({ timeout: 60_000 });
  expect(requests.some((url) => new URL(url).pathname.startsWith('/sb/'))).toBe(true);

  const precached = new Set(builtShell().files.map((file) => file.path));
  const caches = await cachedPaths(page);
  expect(caches).toHaveLength(1);
  for (const { paths } of caches) {
    expect(paths.length).toBe(precached.size);
    for (const path of paths) {
      expect(precached.has(path), path).toBe(true);
      expect(path).not.toContain('/sb/');
    }
  }

  await context.setOffline(true);
  expect(await fetchOutcome(page, '/sb/rest/v1/exercises')).toBe('rejected');
  expect(await fetchOutcome(page, '/sb/auth/v1/user')).toBe('rejected');
  await context.setOffline(false);

  const appOrigin = new URL(baseURL!).origin;
  expect(requests.filter((url) => new URL(url).origin !== appOrigin)).toEqual([]);
});

test('every tab settles offline within seconds without an uncaught error', async ({ context, page }) => {
  test.setTimeout(240_000);
  const username = uniqueUsername('pwa_c');
  await register(page, username);
  await waitForController(page);
  await context.setOffline(true);
  await page.close();

  const cold = await context.newPage();
  const errors: string[] = [];
  cold.on('pageerror', (error) => errors.push(error.message));
  expect((await cold.goto('/'))?.fromServiceWorker()).toBe(true);
  const markOnline = await markPageOffline(cold);
  await expect(cold.getByText(OFFLINE_BANNER)).toBeVisible();
  await expect(cold.getByRole('button', { name: 'Start workout' })).toBeVisible();

  const main = cold.getByRole('main');
  for (const tab of ['Skills', 'Log', 'Friends', 'Profile', 'Train'] satisfies Tab[]) {
    const previous = await main.elementHandle();
    const started = Date.now();
    await openTab(cold, tab);
    await expect
      .poll(
        () =>
          main.evaluate(
            (element, before) =>
              element !== before &&
              (element.querySelector('[role=alert]') !== null ||
                (element.querySelector('h1, h2') !== null && !element.textContent?.includes('Loading…'))),
            previous,
          ),
        { timeout: OFFLINE_TAB_BUDGET_MS },
      )
      .toBe(true);
    noteOpenTime(tab, started);
  }
  expect((await cold.goto('/profile/settings'))?.fromServiceWorker()).toBe(true);
  await expect(cold.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(cold.getByRole('heading', { name: 'App' })).toBeVisible();
  await expect(cold.getByText(`Version ${readChangelog()[0].version}`, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await markOnline();
  await context.setOffline(false);
});

test('screens seen online reopen offline at once from their saved data', async ({ context, page }) => {
  test.setTimeout(240_000);
  const username = uniqueUsername('pwa_d');
  await register(page, username);
  await waitForController(page);
  const main = page.getByRole('main');
  await openTab(page, 'Skills');
  await expect(main.getByText('Total level')).toBeVisible();
  await openTab(page, 'Log');
  await expect(main.getByText('Completion')).toBeVisible();
  await openTab(page, 'Profile');
  await expect(main.getByText(`@${username}`)).toBeVisible();
  await expect(main.locator('.stat-tile', { hasText: 'Collection' })).toContainText('%');
  await openFromProfile(page, 'Programs');
  await expect(main.getByRole('heading', { name: 'Templates' })).toBeVisible();
  await openTab(page, 'Train');

  await context.setOffline(true);
  expect((await page.reload())?.fromServiceWorker()).toBe(true);
  const markOnline = await markPageOffline(page);
  await expectProvenOffline(page);
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();

  const savedScreens: { tab: Tab; notice: string; shown: string }[] = [
    { tab: 'Skills', notice: OFFLINE_SKILLS_NOTICE, shown: 'Total level' },
    { tab: 'Log', notice: OFFLINE_COLLECTION_NOTICE, shown: 'Completion' },
    { tab: 'Profile', notice: OFFLINE_PROFILE_NOTICE, shown: `@${username}` },
  ];
  for (const { tab, notice, shown } of savedScreens) {
    const started = Date.now();
    await openTab(page, tab);
    await expect(main.getByText(notice)).toBeVisible({ timeout: OFFLINE_TAB_BUDGET_MS });
    await expect(main.getByText(shown)).toBeVisible({ timeout: OFFLINE_TAB_BUDGET_MS });
    noteOpenTime(tab, started);
  }
  await expect(main.locator('.stat-tile', { hasText: 'Collection' })).toContainText('%');

  const started = Date.now();
  await page.getByRole('main').getByRole('link', { name: 'Programs', exact: true }).click();
  await expect(main.getByText(OFFLINE_PROGRAMS_NOTICE)).toBeVisible({ timeout: OFFLINE_TAB_BUDGET_MS });
  await expect(main.getByRole('heading', { name: 'Templates' })).toBeVisible({ timeout: OFFLINE_TAB_BUDGET_MS });
  noteOpenTime('Programs', started);
  await markOnline();
  await context.setOffline(false);
});

test('signing out offline with an expired token stays signed out after a cold start', async ({ context, page }) => {
  test.setTimeout(180_000);
  await register(page, uniqueUsername('pwa_s'));
  await waitForController(page);
  await context.setOffline(true);
  await writeSession(page, { expires_at: nowInSeconds() - 60 });
  await page.close();

  const cold = await context.newPage();
  expect((await cold.goto('/profile/settings'))?.fromServiceWorker()).toBe(true);
  await markPageOffline(cold);
  await cold.getByRole('button', { name: 'Sign out' }).click();
  await expect(cold.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await cold.evaluate((key) => localStorage.getItem(key), authStorageKey)).toBeNull();
  await cold.close();

  const again = await context.newPage();
  expect((await again.goto('/'))?.fromServiceWorker()).toBe(true);
  await expect(again.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(again.getByRole('link', { name: 'Train', exact: true })).toHaveCount(0);
  await context.setOffline(false);
});
