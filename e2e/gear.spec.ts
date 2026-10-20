import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  definitionOf,
  logExercise,
  logWorkout,
  openLatestWorkout,
  openTab,
  register,
  uniqueUsername,
} from './support/app.ts';
import { equipGear, grantItems } from './support/db.ts';
import { openItems } from './support/challenge.ts';

const GEAR_BONUS_LINE = /^Gear bonus \+\d+ XP$/;

async function logSquats(page: Page) {
  await logWorkout(page, () =>
    logExercise(page, 'back squat', 'Back Squat', [
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
    ]),
  );
}

function coreGain(page: Page) {
  return page
    .getByRole('list', { name: 'XP gained' })
    .getByRole('listitem')
    .filter({ hasText: /^Core:/ });
}

test('equip and unequip gear in the Items tab and see the bonus per skill', async ({ page }) => {
  const username = uniqueUsername('gear');
  await register(page, username);
  await grantItems(username, { rookie_belt: 1 });

  await openItems(page);
  await page.getByRole('main').getByRole('button', { name: 'Rookie belt', exact: true }).click();
  const details = page.getByRole('region', { name: 'Item details' });
  await details.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Equipped Rookie belt' })).toBeVisible();

  const loadout = page.getByRole('region', { name: 'Loadout' });
  await expect(definitionOf(loadout, 'Belt')).toHaveText('Rookie belt');
  const bonus = loadout.getByRole('list', { name: 'Gear bonus' });
  await expect(bonus.getByRole('listitem')).toHaveText(['Back +0.5%', 'Legs +0.5%', 'Core +1.4%']);

  await details.getByRole('button', { name: 'Unequip', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Unequipped Rookie belt' })).toBeVisible();
  await expect(definitionOf(loadout, 'Belt')).toHaveText('Empty');
  await expect(loadout.getByText('No gear bonus', { exact: true })).toBeVisible();
  await expect(details.getByRole('button', { name: 'Equip', exact: true })).toBeVisible();
});

test('the reveal and the workout detail show the gear bonus only with gear equipped', async ({ page }) => {
  const username = uniqueUsername('gear_xp');
  await register(page, username);

  await logSquats(page);
  await expect(coreGain(page)).toBeVisible();
  await expect(page.getByText(/Gear bonus/)).toHaveCount(0);

  await grantItems(username, { ascendant_belt: 1 });
  await equipGear(username, 'ascendant_belt');
  await openTab(page, 'Train');
  await logSquats(page);
  await expect(coreGain(page).getByText(GEAR_BONUS_LINE)).toBeVisible();

  await openLatestWorkout(page);
  await expect(page.getByText(/^includes Gear bonus \+\d+ XP$/)).toBeVisible();
});

async function expectRookieBeltInLoadout(page: Page) {
  await expect(definitionOf(page.getByRole('region', { name: 'Loadout' }), 'Belt')).toHaveText('Rookie belt');
}

test('the loadout shows on your profile, the friend preview and a friend profile', async ({ newPerson, page }) => {
  const username = uniqueUsername('gear_pro');
  await register(page, username);
  await grantItems(username, { rookie_belt: 1 });
  await equipGear(username, 'rookie_belt');
  await page.reload();

  await openTab(page, 'Profile');
  await expectRookieBeltInLoadout(page);
  await page.getByRole('link', { name: 'Preview what friends see' }).click();
  await expectRookieBeltInLoadout(page);

  const friend = await newPerson();
  const friendName = uniqueUsername('gear_fr');
  await register(friend, friendName);
  await openTab(page, 'Friends');
  await page.getByLabel('Add a friend by exact username').fill(friendName);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('status').getByText(`Request sent to ${friendName}`, { exact: true })).toBeVisible();
  await openTab(friend, 'Friends');
  await friend.getByRole('button', { name: 'Accept' }).click();
  await friend
    .getByRole('list', { name: 'Friends list' })
    .getByRole('link', { name: new RegExp(username) })
    .click();
  await expectRookieBeltInLoadout(friend);
});
