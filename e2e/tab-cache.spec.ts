import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  logBench,
  openFromProfile,
  openLatestWorkout,
  openTab,
  register,
  setRow,
  skillCard,
  uniqueUsername,
} from './support/app.ts';

const SKILL_XP = '**/rest/v1/user_skills*';
const PROFILE_READ = '**/rest/v1/profile_private*';
const FEED = '**/rest/v1/rpc/get_feed*';
const EMPTY_FEED = 'No posts yet. Add friends, or log a personal record (PR).';
const PAST_FRESH_WINDOW = '01:05';

function holdRequests(page: Page, url: string, method = 'GET'): () => void {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  void page.route(url, async (route) => {
    if (route.request().method() === method) await held;
    await route.continue();
  });
  return release;
}

function countRequests(page: Page, url: RegExp): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (url.test(request.url())) count += 1;
  });
  return () => count;
}

function chestCard(page: Page) {
  return skillCard(page, 'Chest');
}

async function chestCardText(page: Page): Promise<string> {
  await openTab(page, 'Skills');
  await expect(chestCard(page)).toBeVisible();
  return (await chestCard(page).textContent()) ?? '';
}

test('a first visit shows a skeleton under the real heading until the data arrives', async ({ newPerson }) => {
  const page = await newPerson();
  await register(page, uniqueUsername('tcf'));
  const release = holdRequests(page, FEED, 'POST');

  await openTab(page, 'Friends');
  await expect(page.getByRole('heading', { level: 1, name: 'Friends' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Loading…' })).toHaveCount(1);
  await expect(page.getByText(EMPTY_FEED)).toHaveCount(0);

  release();
  await expect(page.getByText(EMPTY_FEED)).toBeVisible();
  await expect(page.getByRole('main').getByText('Loading…', { exact: true })).toHaveCount(0);
});

test('returning to a tab soon after shows its last data without loading it again', async ({ newPerson }) => {
  const page = await newPerson();
  await register(page, uniqueUsername('tcr'));
  await openTab(page, 'Skills');
  await expect(chestCard(page)).toBeVisible();
  await openTab(page, 'Profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();

  const skillXpReads = countRequests(page, /\/rest\/v1\/user_skills/);
  await openTab(page, 'Skills');
  await expect(chestCard(page)).toBeVisible();
  await expect(page.getByRole('main').getByText('Loading…', { exact: true })).toHaveCount(0);
  await openTab(page, 'Profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  expect(skillXpReads()).toBe(0);
});

test('returning to a tab after a while shows its last data at once while it refreshes', async ({ newPerson }) => {
  const page = await newPerson();
  await page.clock.install();
  await register(page, uniqueUsername('tco'));
  await openTab(page, 'Skills');
  await expect(chestCard(page)).toBeVisible();
  await openTab(page, 'Profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  await page.clock.fastForward(PAST_FRESH_WINDOW);

  const release = holdRequests(page, SKILL_XP);
  const refreshed = page.waitForRequest(SKILL_XP);
  await openTab(page, 'Skills');
  await expect(chestCard(page)).toBeVisible();
  await expect(page.getByRole('main').getByText('Loading…', { exact: true })).toHaveCount(0);
  await refreshed;
  release();
});

test('a setting changed while a refresh is in flight is not undone by that refresh', async ({ newPerson }) => {
  const page = await newPerson();
  await page.clock.install();
  await register(page, uniqueUsername('tcs'));
  await openFromProfile(page, 'Settings');
  await expect(page.getByRole('radio', { name: 'Simple', exact: true })).toHaveAttribute('aria-checked', 'true');
  await openTab(page, 'Train');
  await page.clock.fastForward(PAST_FRESH_WINDOW);

  const release = holdRequests(page, PROFILE_READ);
  const refreshStarted = page.waitForRequest(
    (request) => request.url().includes('/rest/v1/profile_private') && request.method() === 'GET',
  );
  await openFromProfile(page, 'Settings');
  await refreshStarted;
  const rpe = page.getByRole('radio', { name: 'RPE', exact: true });
  await rpe.click();
  await expect(rpe).toHaveAttribute('aria-checked', 'true');
  const refreshDone = page.waitForResponse(
    (response) => response.url().includes('/rest/v1/profile_private') && response.request().method() === 'GET',
  );
  release();
  await refreshDone;
  await expect(rpe).toHaveAttribute('aria-checked', 'true');
});

test('finishing a workout shows its XP on the Skills tab at once', async ({ newPerson }) => {
  const page = await newPerson();
  await register(page, uniqueUsername('tcw'));
  const before = await chestCardText(page);

  await openTab(page, 'Train');
  await logBench(page);
  await openTab(page, 'Skills');
  await expect(chestCard(page)).not.toHaveText(before);
});

test('editing and deleting a workout in History updates the Skills tab', async ({ newPerson }) => {
  const page = await newPerson();
  await register(page, uniqueUsername('tce'));
  const fresh = await chestCardText(page);
  await openTab(page, 'Train');
  await logBench(page);
  const logged = await chestCardText(page);
  expect(logged).not.toBe(fresh);

  await openLatestWorkout(page);
  const firstSet = setRow(page, 1);
  await firstSet.getByLabel('reps', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await openTab(page, 'Skills');
  await expect(chestCard(page)).not.toHaveText(logged);

  await openLatestWorkout(page);
  await page.getByRole('button', { name: 'Delete workout' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Workout deleted.')).toBeVisible();
  await openTab(page, 'Skills');
  await expect(chestCard(page)).toHaveText(fresh);
});

test('a workout finished in another tab updates the Skills tab open here', async ({ newPerson }) => {
  const page = await newPerson();
  await register(page, uniqueUsername('tct'));
  const second = await page.context().newPage();
  await second.goto('/skills');
  await expect(chestCard(second)).toBeVisible();
  const before = (await chestCard(second).textContent()) ?? '';

  await logBench(page);
  await expect(chestCard(second)).not.toHaveText(before);
});
