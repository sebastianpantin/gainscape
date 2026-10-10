import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { emailOf, openTab, register, uniqueUsername } from './support/app.ts';
import { createConfirmedAccount } from './support/db.ts';
import { befriend, failRpc, friendsAlert, friendshipStatus, restoreRpc } from './support/friendship.ts';

const GENERIC_PROBLEM = 'Something went wrong. Try again.';

async function openFriendProfile(page: Page, friendName: string) {
  await openTab(page, 'Friends');
  await page
    .getByRole('list', { name: 'Friends list' })
    .getByRole('link', { name: new RegExp(friendName) })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: friendName, exact: true })).toBeVisible();
}

for (const rpc of ['list_friends', 'get_feed']) {
  test(`the friends screen shows a retryable problem when ${rpc} fails`, async ({ page }) => {
    await register(page, uniqueUsername('ff'));
    await failRpc(page, rpc);

    await openTab(page, 'Friends');
    await expect(friendsAlert(page)).toHaveText(GENERIC_PROBLEM);
    await expect(page.getByLabel('Add a friend by exact username')).toHaveCount(0);

    await restoreRpc(page, rpc);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByLabel('Add a friend by exact username')).toBeVisible();
    await expect(page.getByText('No posts yet. Add friends, or log a personal record (PR).')).toBeVisible();
    await expect(friendsAlert(page)).toHaveCount(0);
  });
}

test('the friend preview shows a retryable problem when the profile view fails', async ({ page }) => {
  const username = uniqueUsername('fp');
  await register(page, username);
  await failRpc(page, 'get_profile');

  await openTab(page, 'Profile');
  await page.getByRole('link', { name: 'Preview what friends see' }).click();
  await expect(friendsAlert(page)).toHaveText(GENERIC_PROBLEM);

  await restoreRpc(page, 'get_profile');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { level: 2, name: username, exact: true })).toBeVisible();
  await expect(friendsAlert(page)).toHaveCount(0);
});

async function aliceWithFriend(page: Page, prefix: string): Promise<{ aliceName: string; bobName: string }> {
  const aliceName = uniqueUsername(`${prefix}_a`);
  const bobName = uniqueUsername(`${prefix}_b`);
  await createConfirmedAccount(emailOf(bobName), bobName, 'UTC');
  await register(page, aliceName);
  await befriend(aliceName, bobName);
  return { aliceName, bobName };
}

test('keeping a friend after asking to remove them leaves the friendship in place', async ({ page }) => {
  const { aliceName, bobName } = await aliceWithFriend(page, 'keep');
  await openFriendProfile(page, bobName);

  await page.getByRole('button', { name: 'Remove friend' }).click();
  await expect(page.getByText(`Remove ${bobName} from your friends?`)).toBeVisible();
  await page.getByRole('button', { name: 'Keep friend' }).click();

  await expect(page.getByRole('button', { name: 'Remove for good' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove friend' })).toBeVisible();
  await expect.poll(() => friendshipStatus(aliceName, bobName)).toBe('accepted');
  await page.getByRole('link', { name: '‹ Friends' }).click();
  await expect(page.getByRole('list', { name: 'Friends list' })).toContainText(bobName);
});

test('a failed removal shows the problem and keeps the friend', async ({ page }) => {
  const { aliceName, bobName } = await aliceWithFriend(page, 'rmf');
  await openFriendProfile(page, bobName);
  await failRpc(page, 'remove_friend');

  await page.getByRole('button', { name: 'Remove friend' }).click();
  await page.getByRole('button', { name: 'Remove for good' }).click();

  await expect(friendsAlert(page)).toHaveText(GENERIC_PROBLEM);
  await expect(page.getByRole('heading', { level: 2, name: bobName, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove for good' })).toBeEnabled();
  await expect.poll(() => friendshipStatus(aliceName, bobName)).toBe('accepted');
});
