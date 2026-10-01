import { expect, type Page, test } from '@playwright/test';
import {
  authStorageKey,
  logExercise,
  openTab,
  readSession,
  readStoredDraft,
  register,
  type Tab,
  writeSession,
} from '../support/app.ts';
import { sessionCount, setCount } from '../support/db.ts';
import { expectNoAxeViolations } from '../support/a11y.ts';
import { expectFontsLoaded } from '../support/fonts.ts';
import {
  builtShell,
  cachedPaths,
  fetchOutcome,
  markPageOffline,
  nowInSeconds,
  OFFLINE_BANNER,
  uniqueUsername,
  waitForController,
} from '../support/pwa.ts';

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
  await expect(benchCard.getByLabel(/kg/)).toHaveValue('60');
  await expect(benchCard.getByLabel('reps')).toHaveValue('5');
  expect((await readSession(cold)).expires_at).toBeLessThan(nowInSeconds());
  await expectFontsLoaded(cold);

  await logExercise(cold, 'squat', 'Back Squat', [{ weightKg: 80, reps: 5 }]);
  await cold.getByRole('button', { name: 'Finish workout' }).click();
  await expect(cold.getByText(/Couldn't reach the server/)).toBeVisible({ timeout: 60_000 });

  await markOnline();
  await context.setOffline(false);
  await expect(cold.getByRole('heading', { name: 'Workout complete!' })).toBeVisible({ timeout: 90_000 });
  expect(await sessionCount(username)).toBe(1);
  expect(await setCount(sessionId)).toBe(2);
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

test('every tab renders offline without an uncaught error', async ({ context, page }) => {
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
    await openTab(cold, tab);
    await expect
      .poll(
        () =>
          main.evaluate(
            (element) =>
              element.querySelector('[role=alert]') !== null ||
              (element.querySelector('h1, h2') !== null && !element.textContent?.includes('Loading…')),
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
  }
  expect((await cold.goto('/profile/settings'))?.fromServiceWorker()).toBe(true);
  await expect(cold.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(cold.getByRole('heading', { name: 'App' })).toBeVisible();
  expect(errors).toEqual([]);
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
