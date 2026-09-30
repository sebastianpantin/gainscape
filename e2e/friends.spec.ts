import { expect, type Page, test } from '@playwright/test';
import { logExercise, openFromProfile, openTab, register } from './support/app.ts';

async function logBench(page: Page, weightKg: number) {
  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg, reps: 5 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
}

function feedItem(page: Page, text: string) {
  return page.getByRole('list', { name: 'Feed' }).getByTestId('feed-item').filter({ hasText: text });
}

test('friends: request, feed with gz and hidden weights, hiscores, profile and removal', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const aliceName = `fa_${stamp}`;
  const bobName = `fb_${stamp}`;
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await register(alice, aliceName);
  await register(bob, bobName);

  await openTab(alice, 'Friends');
  await alice.getByLabel('Add a friend by exact username').fill(bobName);
  await alice.getByRole('button', { name: 'Send' }).click();
  await expect(alice.getByRole('status')).toHaveText(`Request sent to ${bobName}`);

  await openTab(bob, 'Friends');
  const request = bob.getByTestId('incoming-request');
  await expect(request).toContainText(`${aliceName} wants to be friends`);
  await request.getByRole('button', { name: 'Accept' }).click();
  await expect(bob.getByRole('list', { name: 'Friends list' })).toContainText(aliceName);

  await logBench(bob, 60);
  await logBench(bob, 80);

  await alice.reload();
  const pr = feedItem(alice, 'New 5RM Barbell Bench Press: 80 kg');
  await expect(pr).toBeVisible();
  await pr.getByRole('button', { name: /Say gz to/ }).click();
  await expect(pr.getByRole('button', { name: /Remove gz from .*, 1 so far/ })).toBeVisible();

  await openTab(bob, 'Friends');
  const ownPr = feedItem(bob, 'New 5RM Barbell Bench Press: 80 kg');
  await expect(ownPr.getByLabel('1 gz')).toBeVisible();
  await expect(ownPr.getByRole('button')).toHaveCount(0);

  await openFromProfile(bob, 'Settings');
  const showWeights = bob.getByRole('switch', { name: 'Show my weights to friends' });
  await showWeights.click();
  await expect(showWeights).toHaveAttribute('aria-checked', 'false');

  await alice.reload();
  const hidden = feedItem(alice, 'New 5RM Barbell Bench Press');
  await expect(hidden).toContainText(`Weights hidden by ${bobName}`);
  await expect(hidden).not.toContainText('80 kg');

  await alice.getByRole('navigation', { name: 'Friends' }).getByRole('link', { name: 'Hiscores' }).click();
  await alice.getByRole('radio', { name: 'Chest' }).click();
  const ranking = alice.getByRole('list', { name: 'Ranked by Chest' }).getByRole('listitem');
  await expect(ranking).toHaveCount(2);
  await expect(ranking.nth(0)).toContainText(bobName);
  await expect(ranking.nth(1)).toContainText(`${aliceName} (you)`);

  await alice.getByRole('navigation', { name: 'Friends' }).getByRole('link', { name: 'Feed' }).click();
  await alice
    .getByRole('list', { name: 'Friends list' })
    .getByRole('link', { name: new RegExp(bobName) })
    .click();
  await expect(alice.getByTestId('profile-display-name')).toHaveText(bobName);
  await expect(alice.getByTestId('profile-total')).not.toHaveText('—');
  await expect(alice.getByText('Weights hidden')).toBeVisible();
  await alice.getByRole('button', { name: 'Remove friend' }).click();
  await alice.getByRole('button', { name: 'Remove for good' }).click();
  await expect(alice.getByText('No posts yet. Add friends, or log a PR.')).toBeVisible();

  await openTab(alice, 'Profile');
  await expect(alice.getByTestId('profile-total')).not.toHaveText('—');
  await expect(alice.getByTestId('profile-collection')).not.toHaveText('—');
  const total = await alice.getByTestId('profile-total').textContent();
  const collection = await alice.getByTestId('profile-collection').textContent();
  await alice.getByRole('link', { name: 'Preview what friends see' }).click();
  await expect(alice.getByTestId('profile-total')).toHaveText(total ?? '');
  await expect(alice.getByTestId('profile-collection')).toHaveText(collection ?? '');
});
