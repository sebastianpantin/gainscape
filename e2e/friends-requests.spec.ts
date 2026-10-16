import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { openTab, register, uniqueUsername } from './support/app.ts';
import { friendshipStatus } from './support/friendship.ts';

async function sendRequest(page: Page, username: string) {
  await openTab(page, 'Friends');
  await page.getByLabel('Add a friend by exact username').fill(username);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('status').getByText(`Request sent to ${username}`, { exact: true })).toBeVisible();
}

function sentRequests(page: Page) {
  return page.getByRole('region', { name: 'Sent requests' });
}

test('declining an incoming request removes it and leaves no friendship on either side', async ({ newPerson }) => {
  const aliceName = uniqueUsername('dec_a');
  const bobName = uniqueUsername('dec_b');
  const alice = await newPerson();
  const bob = await newPerson();
  await register(alice, aliceName);
  await register(bob, bobName);
  await sendRequest(alice, bobName);

  await openTab(bob, 'Friends');
  await expect(bob.getByText(`${aliceName} wants to be friends`)).toBeVisible();
  await expect(bob.getByRole('button', { name: `Accept ${aliceName}`, exact: true })).toBeVisible();
  await bob.getByRole('button', { name: `Decline ${aliceName}`, exact: true }).click();

  await expect(bob.getByRole('status').getByText(`Declined ${aliceName}`, { exact: true })).toBeVisible();
  await expect(bob.getByText(`${aliceName} wants to be friends`)).toHaveCount(0);
  await expect.poll(() => friendshipStatus(aliceName, bobName)).toBe('declined');
  await bob.reload();
  await expect(bob.getByLabel('Add a friend by exact username')).toBeVisible();
  await expect(bob.getByText(`${aliceName} wants to be friends`)).toHaveCount(0);
  await expect(bob.getByRole('list', { name: 'Friends list' })).toHaveCount(0);

  await alice.reload();
  await expect(sentRequests(alice)).toContainText(bobName);
  await expect(alice.getByRole('list', { name: 'Friends list' })).toHaveCount(0);
});

test('cancelling a sent request removes it for the sender and the recipient', async ({ newPerson }) => {
  const aliceName = uniqueUsername('can_a');
  const bobName = uniqueUsername('can_b');
  const alice = await newPerson();
  const bob = await newPerson();
  await register(alice, aliceName);
  await register(bob, bobName);
  await sendRequest(alice, bobName);

  await openTab(bob, 'Friends');
  await expect(bob.getByText(`${aliceName} wants to be friends`)).toBeVisible();

  await sentRequests(alice).getByRole('button', { name: 'Cancel' }).click();
  await expect(
    alice.getByRole('status').getByText(`Cancelled the request to ${bobName}`, { exact: true }),
  ).toBeVisible();
  await expect(sentRequests(alice)).toHaveCount(0);
  await expect.poll(() => friendshipStatus(aliceName, bobName)).toBeNull();

  await bob.reload();
  await expect(bob.getByLabel('Add a friend by exact username')).toBeVisible();
  await expect(bob.getByText(`${aliceName} wants to be friends`)).toHaveCount(0);
});

test('sending a request with no username says to enter one and sends nothing', async ({ page }) => {
  await register(page, uniqueUsername('req_empty'));
  await openTab(page, 'Friends');
  const field = page.getByLabel('Add a friend by exact username');
  await field.fill('  @ ');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription('Enter a username.');
  await expect(field).toBeFocused();

  await field.fill('someone');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Enter a username.', { exact: true })).toHaveCount(0);
});
