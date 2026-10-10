import { expect, type Page, test } from '@playwright/test';
import { finishWorkout, openTab, register, uniqueUsername } from './support/app.ts';
import {
  CHALLENGE_NAME,
  challengeSuperset,
  expectDeadliftPrefill,
  finishWithBodyweight,
  itemDetails,
  logDeadliftToFailure,
  markEveryRoundDone,
  OFFLINE_ITEMS_NOTICE,
  openItems,
  SCROLL_KEY,
  SCROLL_NAME,
  scrollSlot,
  shortenFirstDeadliftSet,
  startChallenge,
} from './support/challenge.ts';
import { grantItems, scrollQuantity } from './support/db.ts';

function backGain(page: Page) {
  return page
    .getByRole('list', { name: 'XP gained' })
    .getByRole('listitem')
    .filter({ hasText: /^Back:/ });
}

test('a challenge starts offline from the saved items with loads from the e1RM, and discarding it keeps the scroll', async ({
  context,
  page,
}) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('ch_off');
  await register(page, username);
  await logDeadliftToFailure(page, 140);
  await grantItems(username, { [SCROLL_KEY]: 1 });

  await openItems(page);
  await scrollSlot(page).click();
  await expect(itemDetails(page).getByRole('button', { name: 'Start challenge' })).toBeEnabled();
  await expect(page.getByText(OFFLINE_ITEMS_NOTICE)).toHaveCount(0);

  await context.setOffline(true);
  await openTab(page, 'Train');
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await page.goBack();
  await expect(page.getByText(OFFLINE_ITEMS_NOTICE)).toBeVisible();

  await startChallenge(page);
  await expect(page).toHaveURL(/\/$/);
  const superset = page.getByRole('region', { name: 'Superset: Deadlift and Pull-up' });
  await expect(superset).toBeVisible();
  await expect(
    superset.getByRole('list', { name: 'Rounds' }).getByRole('listitem', { name: /^Round \d+$/ }),
  ).toHaveCount(5);
  await expectDeadliftPrefill(page, 100);
  await expect(page.getByRole('region', { name: 'Challenge', exact: true })).toContainText(
    `Challenge: ${CHALLENGE_NAME}`,
  );

  await page.goBack();
  await expect(page.getByText(OFFLINE_ITEMS_NOTICE)).toBeVisible();
  await scrollSlot(page).click();
  await expect(itemDetails(page).getByText('Finish or discard your current workout first')).toBeVisible();
  await expect(itemDetails(page).getByRole('button', { name: 'Start challenge' })).toBeDisabled();

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Discard challenge' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard workout' }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();

  await context.setOffline(false);
  expect(await scrollQuantity(username, SCROLL_KEY)).toBe(1);
  await openItems(page);
  await expect(scrollSlot(page)).toBeVisible();
});

test('the reveal names a passed challenge with its bonus and explains a failed one', async ({ page }) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('ch_rev');
  await register(page, username);
  await grantItems(username, { [SCROLL_KEY]: 1 });

  await openItems(page);
  await scrollSlot(page).click();
  await expect(
    itemDetails(page).getByText('Log Deadlift first: this challenge sets its loads from your e1RM.'),
  ).toBeVisible();
  await expect(itemDetails(page).getByRole('button', { name: 'Start challenge' })).toBeDisabled();

  await openTab(page, 'Train');
  await logDeadliftToFailure(page, 140);
  await openItems(page);
  await startChallenge(page);
  await expectDeadliftPrefill(page, 100);
  await markEveryRoundDone(page);
  await finishWithBodyweight(page);
  await expect(page.getByText(`Challenge complete: ${CHALLENGE_NAME}`)).toBeVisible();
  await expect(backGain(page).getByText(/^Challenge bonus \+\d+ XP$/)).toBeVisible();
  expect(await scrollQuantity(username, SCROLL_KEY)).toBe(0);

  await grantItems(username, { [SCROLL_KEY]: 1 });
  await openItems(page);
  await startChallenge(page);
  await shortenFirstDeadliftSet(page, 4);
  await markEveryRoundDone(page);
  await finishWorkout(page);
  await expect(page.getByText(`Challenge failed: ${CHALLENGE_NAME}`)).toBeVisible();
  await expect(page.getByText('Not every prescribed set reached its reps and load')).toBeVisible();
  await expect(page.getByText(/Challenge bonus/)).toHaveCount(0);
  expect(await scrollQuantity(username, SCROLL_KEY)).toBe(0);
  await expect(challengeSuperset(page)).toHaveCount(0);
});

test('a challenge workout saved after its scroll is gone is saved without the challenge and says so', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('ch_gone');
  await register(page, username);
  await logDeadliftToFailure(page, 140);
  await grantItems(username, { [SCROLL_KEY]: 1 });

  await openItems(page);
  await startChallenge(page);
  await grantItems(username, { [SCROLL_KEY]: 0 });
  await markEveryRoundDone(page);
  await finishWithBodyweight(page);
  await expect(
    page.getByText(
      `Challenge not applied: ${CHALLENGE_NAME} couldn't be applied to this workout, so it was saved as a normal workout.`,
    ),
  ).toBeVisible();
  await expect(page.getByText(/^Challenge (complete|failed):/)).toHaveCount(0);
  await expect(page.getByText(/Challenge bonus/)).toHaveCount(0);
});

test('a challenge that used its scroll leaves none in the saved items', async ({ context, page }) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('ch_used');
  await register(page, username);
  await logDeadliftToFailure(page, 140);
  await grantItems(username, { [SCROLL_KEY]: 1 });

  await openItems(page);
  await startChallenge(page);
  await markEveryRoundDone(page);
  await finishWithBodyweight(page);
  await expect(page.getByText(`Challenge complete: ${CHALLENGE_NAME}`)).toBeVisible();

  await context.setOffline(true);
  await openItems(page);
  await expect(page.getByText(OFFLINE_ITEMS_NOTICE)).toBeVisible();
  await expect(scrollSlot(page)).toHaveCount(0);
  await page
    .getByRole('main')
    .getByRole('button', { name: `${SCROLL_NAME} ×0`, exact: true })
    .click();
  await expect(itemDetails(page).getByRole('button', { name: 'Start challenge' })).toHaveCount(0);
  await context.setOffline(false);
});
