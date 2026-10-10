import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { logExercise, openFromProfile, openTab, register, uniqueUsername } from './support/app.ts';
import { befriend, openFriendProfile, registerWithFriend, showsBodyweight } from './support/friendship.ts';

function feedItem(page: Page, text: string) {
  return page.getByRole('list', { name: 'Feed' }).getByRole('listitem').filter({ hasText: text });
}

async function logWeightedDipWithBodyweight(page: Page, addedKg: number, bodyweightKg: number) {
  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'weighted dip', 'Weighted Dip', [{ weightKg: addedKg, reps: 5 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  const complete = page.getByRole('heading', { name: 'Workout complete!' });
  const bodyweight = page.getByLabel('Bodyweight (kg)');
  await expect(complete.or(bodyweight)).toBeVisible();
  if (await bodyweight.isVisible()) {
    await bodyweight.fill(String(bodyweightKg));
    await page.getByRole('button', { name: 'Save and finish workout' }).click();
  }
  await expect(complete).toBeVisible();
}

async function setShowBodyweight(page: Page, username: string, shown: boolean) {
  await openFromProfile(page, 'Settings');
  const toggle = page.getByRole('switch', { name: 'Show my bodyweight to friends' });
  await expect(toggle).toHaveAttribute('aria-checked', String(!shown));
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', String(shown));
  await expect.poll(() => showsBodyweight(username)).toBe(shown);
}

test('a friend sees the total load of a weighted dip only while bodyweight is shown', async ({ newPerson }) => {
  const aliceName = uniqueUsername('bwp_a');
  const bobName = uniqueUsername('bwp_b');
  const alice = await newPerson();
  const bob = await newPerson();
  await register(alice, aliceName);
  await register(bob, bobName);
  await befriend(aliceName, bobName);
  await logWeightedDipWithBodyweight(bob, 10, 80);
  await logWeightedDipWithBodyweight(bob, 20, 80);

  await openTab(alice, 'Friends');
  const dip = feedItem(alice, 'New 5RM Weighted Dip');
  await expect(dip).toContainText('New 5RM Weighted Dip: +20 kg');
  await expect(dip).not.toContainText('total');

  await setShowBodyweight(bob, bobName, true);
  await alice.reload();
  await expect(dip).toContainText('New 5RM Weighted Dip: +20 kg (100 kg total)');

  await setShowBodyweight(bob, bobName, false);
  await alice.reload();
  await expect(dip).toContainText('New 5RM Weighted Dip: +20 kg');
  await expect(dip).not.toContainText('total');
});

test('a friend without workouts shows no records on their profile', async ({ page }) => {
  const { bobName } = await registerWithFriend(page, 'norec');

  await openFriendProfile(page, bobName);

  const records = page.getByRole('region', { name: 'Records' });
  await expect(records.getByText('No records yet.')).toBeVisible();
  await expect(records.getByText(/^Items found: 0 of \d+$/)).toBeVisible();
});
