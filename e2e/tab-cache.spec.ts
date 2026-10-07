import { expect, type Page } from '@playwright/test';
import { test } from './support/people.ts';
import { openFromProfile, openTab, register, uniqueUsername } from './support/app.ts';

const SKILL_XP = '**/rest/v1/user_skills*';
const PROFILE_READ = '**/rest/v1/profile_private*';
const FEED = '**/rest/v1/rpc/get_feed*';
const EMPTY_FEED = 'No posts yet. Add friends, or log a PR.';

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

function chestCard(page: Page) {
  return page.getByRole('main').getByRole('button', { name: /^Chest/ });
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

test('returning to a tab shows its last data at once while it refreshes', async ({ newPerson }) => {
  const page = await newPerson();
  await register(page, uniqueUsername('tcr'));
  await openTab(page, 'Skills');
  await expect(chestCard(page)).toBeVisible();
  await openTab(page, 'Profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();

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
  await register(page, uniqueUsername('tcs'));
  await openFromProfile(page, 'Settings');
  await expect(page.getByRole('radio', { name: 'Simple', exact: true })).toHaveAttribute('aria-checked', 'true');
  await openTab(page, 'Train');

  const release = holdRequests(page, PROFILE_READ);
  await openFromProfile(page, 'Settings');
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
