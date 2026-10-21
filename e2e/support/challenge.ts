import { expect, type Locator, type Page } from '@playwright/test';
import { addExercise, finishWorkout, openTab, setRow } from './app.ts';

export const SCROLL_KEY = 'scroll_deficit_deadlift';
export const SCROLL_NAME = 'Scroll: Deadlift and Pull-up';
export const CHALLENGE_NAME = 'Deadlift and Pull-up';
export const OFFLINE_ITEMS_NOTICE = 'Offline: using your saved items.';
const ROUNDS = 5;

export async function openItems(page: Page) {
  await openTab(page, 'Collection');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'Items' }).click();
  await expect(page.getByRole('heading', { name: 'Gear' })).toBeVisible();
}

export function scrollSlot(page: Page): Locator {
  return page.getByRole('main').getByRole('button', { name: SCROLL_NAME, exact: true });
}

export function itemDetails(page: Page): Locator {
  return page.getByRole('region', { name: 'Item details' });
}

export function challengeSuperset(page: Page): Locator {
  return page.getByRole('region', { name: `Superset: ${CHALLENGE_NAME}` });
}

function deadliftWeights(page: Page): Locator {
  return challengeSuperset(page)
    .getByRole('list', { name: 'Rounds' })
    .getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ });
}

export async function startChallenge(page: Page) {
  await scrollSlot(page).click();
  await itemDetails(page).getByRole('button', { name: 'Start challenge' }).click();
  await expect(challengeSuperset(page)).toBeVisible();
}

export async function expectDeadliftPrefill(page: Page, weightKg: number) {
  const rounds = challengeSuperset(page).getByRole('list', { name: 'Rounds' });
  await expect(rounds.getByRole('listitem', { name: /^Round \d+$/ })).toHaveCount(ROUNDS);
  await expect(deadliftWeights(page)).toHaveCount(ROUNDS);
  for (let index = 0; index < ROUNDS; index++) {
    await expect(deadliftWeights(page).nth(index)).toHaveValue(String(weightKg));
  }
}

export async function markEveryRoundDone(page: Page) {
  const superset = challengeSuperset(page);
  for (let round = 1; round <= ROUNDS; round++) {
    for (const exerciseName of ['Deadlift', 'Pull-up']) {
      const done = superset.getByRole('button', { name: `Done ${exerciseName} round ${round}` });
      await done.click();
      await expect(done).toHaveAttribute('aria-pressed', 'true');
    }
  }
}

export async function shortenFirstDeadliftSet(page: Page, reps: number) {
  const firstRound = challengeSuperset(page).getByRole('list', { name: 'Rounds' }).getByRole('listitem', {
    name: 'Round 1',
  });
  await firstRound
    .getByRole('listitem', { name: 'Deadlift, set 1', exact: true })
    .getByRole('spinbutton', { name: /^Reps, set \d+$/ })
    .fill(String(reps));
}

export async function finishWithBodyweight(page: Page) {
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
}

export async function logDeadliftToFailure(page: Page, weightKg: number) {
  await page.getByRole('button', { name: 'Start workout' }).click();
  const row = setRow(await addExercise(page, 'deadlift', 'Deadlift'), 1);
  await row.getByRole('spinbutton', { name: /weight in kg, set \d+$/i }).fill(String(weightKg));
  await row.getByRole('spinbutton', { name: /^Reps, set \d+$/ }).fill('1');
  await row.getByRole('radio', { name: 'Failure' }).click();
  await row.getByRole('button', { name: 'Done set 1' }).click();
  await finishWorkout(page);
}
