import { expect, test } from './support/fixtures.ts';
import { openTab, register, uniqueUsername } from './support/app.ts';
import { friendsAlert, friendshipStatus, openFriendProfile, registerWithFriend } from './support/friendship.ts';
import { failRequests, rpc } from './support/network.ts';

const GENERIC_PROBLEM = 'Something went wrong. Try again.';

for (const failingRpc of ['list_friends', 'get_feed']) {
  test(`the friends screen shows a retryable problem when ${failingRpc} fails`, async ({ page }) => {
    await register(page, uniqueUsername('ff'));
    await failRequests(page, rpc(failingRpc));

    await openTab(page, 'Friends');
    await expect(friendsAlert(page)).toHaveText(GENERIC_PROBLEM);
    await expect(page.getByLabel('Add a friend by exact username')).toHaveCount(0);

    await page.unroute(rpc(failingRpc));
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByLabel('Add a friend by exact username')).toBeVisible();
    await expect(page.getByText('No posts yet. Add friends, or log a personal record (PR).')).toBeVisible();
    await expect(friendsAlert(page)).toHaveCount(0);
  });
}

test('the friend preview shows a retryable problem when the profile view fails', async ({ page }) => {
  const username = uniqueUsername('fp');
  await register(page, username);
  await failRequests(page, rpc('get_profile'));

  await openTab(page, 'Profile');
  await page.getByRole('link', { name: 'Preview what friends see' }).click();
  await expect(friendsAlert(page)).toHaveText(GENERIC_PROBLEM);

  await page.unroute(rpc('get_profile'));
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { level: 2, name: username, exact: true })).toBeVisible();
  await expect(friendsAlert(page)).toHaveCount(0);
});

test('keeping a friend after asking to remove them leaves the friendship in place', async ({ page }) => {
  const { aliceName, bobName } = await registerWithFriend(page, 'keep');
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
  const { aliceName, bobName } = await registerWithFriend(page, 'rmf');
  await openFriendProfile(page, bobName);
  await failRequests(page, rpc('remove_friend'));

  await page.getByRole('button', { name: 'Remove friend' }).click();
  await page.getByRole('button', { name: 'Remove for good' }).click();

  await expect(friendsAlert(page)).toHaveText(GENERIC_PROBLEM);
  await expect(page.getByRole('heading', { level: 2, name: bobName, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove for good' })).toBeEnabled();
  await expect.poll(() => friendshipStatus(aliceName, bobName)).toBe('accepted');
});
