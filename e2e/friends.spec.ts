import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  definitionOf,
  logBench,
  logCardio,
  logWorkout,
  openFromProfile,
  openTab,
  register,
  uniqueUsername,
} from './support/app.ts';
import { expectTouchTargets } from './support/a11y.ts';
import { feedItem } from './support/friendship.ts';

async function logRun(page: Page, minutes: number, distance: number) {
  await openTab(page, 'Train');
  await logWorkout(page, () => logCardio(page, 'running', 'Running', [{ minutes, distance, effort: 'Moderate' }]));
}

test('Hiscores without friends says so and leads to adding one', async ({ page }) => {
  await register(page, uniqueUsername('fr_hi_empty'));
  await page.goto('/friends/hiscores');

  await expect(page.getByText('Add friends to rank yourself against them.', { exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Rank by' })).toHaveCount(0);
  await page.getByRole('main').getByRole('link', { name: 'Add a friend', exact: true }).click();
  await expect(page).toHaveURL(/\/friends$/);
  await expect(page.getByLabel('Add a friend by exact username')).toBeVisible();
});

test('friends: request, feed with gz and hidden weights, hiscores, profile and removal', async ({ newPerson }) => {
  const stamp = Date.now().toString(36);
  const aliceName = `fa_${stamp}`;
  const bobName = `fb_${stamp}`;
  const alice = await newPerson();
  const bob = await newPerson();
  await register(alice, aliceName);
  await register(bob, bobName);

  await openTab(alice, 'Friends');
  await alice.getByLabel('Add a friend by exact username').fill(`@${bobName}`);
  await alice.getByRole('button', { name: 'Send' }).click();
  await expect(alice.getByRole('status').getByText(`Request sent to ${bobName}`, { exact: true })).toBeVisible();

  await openTab(bob, 'Friends');
  await expect(bob.getByText(`${aliceName} wants to be friends`)).toBeVisible();
  await bob.getByRole('button', { name: 'Accept' }).click();
  await expect(bob.getByRole('list', { name: 'Friends list' })).toContainText(aliceName);

  await openTab(bob, 'Train');
  await logBench(bob);
  await openTab(bob, 'Train');
  await logBench(bob, 80);
  await logRun(bob, 30, 5);
  await logRun(bob, 36, 6);

  await alice.reload();
  await expect(feedItem(alice, 'New Running record: 6 km · 36 min')).toBeVisible();
  await expect(alice.getByRole('heading', { level: 2, name: 'Feed', exact: true })).toBeVisible();
  await openTab(alice, 'Train');
  const friendActivity = alice.getByRole('region', { name: 'Friends' });
  await expect(friendActivity.getByRole('listitem')).toHaveCount(3);
  await expect(friendActivity.getByRole('listitem').filter({ hasText: bobName })).toHaveCount(3);
  await friendActivity.getByRole('link', { name: 'See all' }).click();
  const pr = feedItem(alice, 'New 5RM Barbell Bench Press: 80 kg');
  await expect(pr).toBeVisible();
  await expect(pr).toContainText(`${bobName} @${bobName}`);
  await expect(alice.getByRole('button', { name: 'What does gz mean?', exact: true })).toBeVisible();
  const phoneViewport = alice.viewportSize()!;
  await alice.setViewportSize({ width: 320, height: 640 });
  await expectTouchTargets(alice);
  await alice.setViewportSize(phoneViewport);
  const gzSaved = alice.waitForResponse((response) => response.url().includes('/rpc/set_gz') && response.ok());
  await pr.getByRole('button', { name: /^Congratulate \(gz\) / }).click();
  await gzSaved;
  await expect(pr.getByRole('button', { name: /^Remove your gz from .*, 1 so far$/ })).toBeVisible();

  await openTab(bob, 'Friends');
  const ownPr = feedItem(bob, 'New 5RM Barbell Bench Press: 80 kg');
  await expect(ownPr.getByLabel('1 gz')).toBeVisible();
  await expect(ownPr.getByRole('button')).toHaveCount(0);

  await openFromProfile(bob, 'Settings');
  const showWeights = bob.getByRole('switch', { name: 'Show my weights to friends' });
  await showWeights.click();
  await expect(showWeights).toHaveAttribute('aria-checked', 'false');
  await expect(showWeights).toBeEnabled();

  await alice.reload();
  const hidden = feedItem(alice, 'New 5RM Barbell Bench Press');
  await expect(hidden).toContainText(`Weights hidden by ${bobName}`);
  await expect(hidden).not.toContainText('80 kg');
  const hiddenRun = feedItem(alice, 'New Running record: 36 min');
  await expect(hiddenRun).toContainText(`Distance hidden by ${bobName}`);
  await expect(hiddenRun).not.toContainText('6 km');

  await alice.getByRole('navigation', { name: 'Friends' }).getByRole('link', { name: 'Hiscores' }).click();
  await expect(alice.getByRole('button', { name: 'What are hiscores?', exact: true })).toBeVisible();
  await alice.getByRole('radio', { name: 'Chest' }).click();
  const ranking = alice.getByRole('list', { name: 'Ranked by Chest' }).getByRole('listitem');
  await expect(ranking).toHaveCount(2);
  await expect(ranking.nth(0)).toContainText(bobName);
  await expect(ranking.nth(1)).toContainText(`${aliceName} (you)`);
  await ranking.nth(0).getByRole('link', { name: bobName }).click();
  await expect(alice.getByRole('heading', { level: 1, name: bobName, exact: true })).toBeVisible();
  await alice.goBack();

  await alice.getByRole('navigation', { name: 'Friends' }).getByRole('link', { name: 'Feed' }).click();
  await alice
    .getByRole('list', { name: 'Friends list' })
    .getByRole('link', { name: new RegExp(bobName) })
    .click();
  await expect(alice.getByRole('heading', { level: 1, name: bobName, exact: true })).toBeVisible();
  await expect(definitionOf(alice, 'Total')).not.toHaveText('—');
  await expect(alice.getByText('Weights hidden')).toBeVisible();
  await alice.getByRole('button', { name: 'Remove friend' }).click();
  await alice.getByRole('button', { name: 'Remove for good' }).click();
  await expect(alice.getByText('No posts yet. Add friends, or log a personal record (PR).')).toBeVisible();

  await openTab(alice, 'Profile');
  await expect(definitionOf(alice, 'Total')).not.toHaveText('—');
  await expect(definitionOf(alice, 'Collection')).not.toHaveText('—');
  const total = await definitionOf(alice, 'Total').textContent();
  const collection = await definitionOf(alice, 'Collection').textContent();
  await alice.getByRole('link', { name: 'Preview what friends see' }).click();
  await expect(definitionOf(alice, 'Total')).toHaveText(total ?? '');
  await expect(definitionOf(alice, 'Collection')).toHaveText(collection ?? '');
});
