import { randomUUID } from 'node:crypto';
import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  exerciseCard,
  logBench,
  openFromProfile,
  openTab,
  pickExercise,
  register,
  uniqueUsername,
} from './support/app.ts';
import { builtInExerciseId, grantItems } from './support/db.ts';
import { openItems } from './support/challenge.ts';
import { failRequests, INJECTED_FAILURE, restTable, rpc } from './support/network.ts';
import { db } from '../tests/integration/local-stack.ts';

const HISTORY_PAGE_SIZE = 50;
const SEEDED_WORKOUTS = HISTORY_PAGE_SIZE + 5;
const OLDEST_WORKOUT_NOTE = 'oldest seeded workout';
const MINUTE_MS = 60 * 1000;

function loadoutPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Loadout' });
}

function workoutLinks(page: Page): Locator {
  return page.getByRole('list', { name: 'Workouts' }).getByRole('link');
}

async function openHistory(page: Page) {
  await openTab(page, 'Log');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
}

async function seedWorkouts(username: string, count: number): Promise<void> {
  const [profile] = await db`select id from public.profiles where username = ${username}`;
  const newest = Date.now() - 2 * 60 * MINUTE_MS;
  const rows = Array.from({ length: count }, (_, index) => {
    const startedAt = new Date(newest - index * 30 * MINUTE_MS).toISOString();
    return {
      id: randomUUID(),
      user_id: profile.id,
      started_at: startedAt,
      ended_at: startedAt,
      local_date: startedAt.slice(0, 10),
      timezone: 'UTC',
      balance_version: 2,
      derived_balance_version: 2,
      notes: index === count - 1 ? OLDEST_WORKOUT_NOTE : null,
      summary: db.json({ xpBySkill: {}, levelUps: [], prs: [], drops: [] }),
    };
  });
  await db`insert into public.sessions ${db(rows)}`;
}

async function registerWithWorkouts(page: Page, prefix: string): Promise<void> {
  const username = uniqueUsername(prefix);
  await register(page, username);
  await seedWorkouts(username, SEEDED_WORKOUTS);
  await openHistory(page);
  await expect(workoutLinks(page)).toHaveCount(HISTORY_PAGE_SIZE);
}

test('Load more on History shows the workouts older than the first page', async ({ page }) => {
  await registerWithWorkouts(page, 'le_more');
  await expect(page.getByText(OLDEST_WORKOUT_NOTE)).toHaveCount(0);

  await page.getByRole('button', { name: 'Load more' }).click();

  await expect(workoutLinks(page)).toHaveCount(SEEDED_WORKOUTS);
  await expect(workoutLinks(page).last()).toContainText(OLDEST_WORKOUT_NOTE);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});

test('a failed Load more on History says so and loads the older workouts when tried again', async ({ page }) => {
  await registerWithWorkouts(page, 'le_more_fail');
  const nextPage = /\/rest\/v1\/sessions\?.*or=/;
  await failRequests(page, nextPage, 'GET');

  await page.getByRole('button', { name: 'Load more' }).click();

  await expect(page.getByRole('alert')).toHaveText('Could not load more workouts.');
  await expect(workoutLinks(page)).toHaveCount(HISTORY_PAGE_SIZE);

  await page.unroute(nextPage);
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(workoutLinks(page)).toHaveCount(SEEDED_WORKOUTS);
});

test('the Items loadout says it could not load, and shows the slots after a reload', async ({ page }) => {
  await register(page, uniqueUsername('le_loadout'));
  await failRequests(page, rpc('get_loadout'), 'POST');

  await openItems(page);

  await expect(loadoutPanel(page)).toContainText("Couldn't load the loadout.");
  await page.unroute(rpc('get_loadout'));
  await page.reload();
  await expect(loadoutPanel(page).getByText('No gear bonus', { exact: true })).toBeVisible();
  await expect(loadoutPanel(page)).not.toContainText("Couldn't load the loadout.");
});

test('equipping gear that fails says so, and equipping again works', async ({ page }) => {
  const username = uniqueUsername('le_equip');
  await register(page, username);
  await grantItems(username, { rookie_belt: 1 });
  await openItems(page);
  await page.getByRole('main').getByRole('button', { name: 'Rookie belt', exact: true }).click();
  const details = page.getByRole('region', { name: 'Item details' });
  await failRequests(page, rpc('equip_gear'), 'POST');

  await details.getByRole('button', { name: 'Equip', exact: true }).click();

  await expect(details.getByRole('alert')).toHaveText("Couldn't change your gear: try again.");
  await expect(details.getByRole('button', { name: 'Equip', exact: true })).toBeEnabled();
  await page.unroute(rpc('equip_gear'));
  await details.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(details.getByRole('button', { name: 'Unequip', exact: true })).toBeVisible();
  await expect(details.getByRole('alert')).toHaveCount(0);
});

test('the exercise progress screen says it could not load progress, and loads after a reload', async ({ page }) => {
  await register(page, uniqueUsername('le_progress'));
  await failRequests(page, restTable('rep_maxes'), 'GET');

  await page.goto(`/collection/exercises/${await builtInExerciseId('barbell_bench_press')}`);

  await expect(page.getByRole('alert')).toHaveText('Could not load progress.');
  await page.unroute(restTable('rep_maxes'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Barbell Bench Press', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the profile says it could not load the bodyweight trend, and shows it after a reload', async ({ page }) => {
  await register(page, uniqueUsername('le_bw'));
  await failRequests(page, rpc('workout_bodyweights'), 'POST');

  await openTab(page, 'Profile');

  await expect(page.getByRole('alert')).toHaveText('Could not load your bodyweight trend.');
  await page.unroute(rpc('workout_bodyweights'));
  await page.reload();
  await expect(page.getByText('Save your bodyweight to start a trend.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Programs says it could not load the powerlifting programs, and lists them after a reload', async ({ page }) => {
  await failRequests(page, restTable('program_templates'), 'GET');
  await register(page, uniqueUsername('le_templates'));

  await openFromProfile(page, 'Programs');

  const powerlifting = page.getByRole('region', { name: 'Powerlifting programs' });
  await expect(powerlifting.getByRole('alert')).toHaveText("Couldn't load the powerlifting programs");
  await page.unroute(restTable('program_templates'));
  await page.reload();
  await expect(powerlifting.getByRole('link', { name: /^Follow / }).first()).toBeVisible();
  await expect(powerlifting.getByRole('alert')).toHaveCount(0);
});

test('Train says it could not load your programs, and shows the program days after a reload', async ({ page }) => {
  await failRequests(page, restTable('programs'), 'GET');
  await register(page, uniqueUsername('le_days'));

  await expect(page.getByRole('alert')).toHaveText("Couldn't load your programs");
  await page.unroute(restTable('programs'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Program days' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('pinning an exercise that fails shows why, and pinning again works', async ({ page }) => {
  await register(page, uniqueUsername('le_pin'));
  await openTab(page, 'Log');
  await failRequests(page, restTable('pinned_exercises'), 'POST');

  await pickExercise(page, 'back squat', 'Back Squat');

  await expect(page.getByRole('alert')).toHaveText(INJECTED_FAILURE);
  await page.unroute(restTable('pinned_exercises'));
  await page.reload();
  await pickExercise(page, 'back squat', 'Back Squat');
  await expect(exerciseCard(page, 'Back Squat').getByRole('button', { name: 'Unpin' })).toBeVisible();
});

test('unpinning an exercise that fails says the pins could not be updated', async ({ page }) => {
  await register(page, uniqueUsername('le_unpin'));
  await openTab(page, 'Log');
  await pickExercise(page, 'back squat', 'Back Squat');
  const backSquat = exerciseCard(page, 'Back Squat');
  await expect(backSquat.getByRole('button', { name: 'Unpin' })).toBeVisible();
  await failRequests(page, restTable('pinned_exercises'), 'DELETE');

  await backSquat.getByRole('button', { name: 'Unpin' }).click();

  await expect(page.getByRole('alert')).toHaveText('Could not update pins.');
  await page.unroute(restTable('pinned_exercises'));
  await page.reload();
  await expect(backSquat.getByRole('button', { name: 'Unpin' })).toBeVisible();
});

test('reordering pins that fails says the pins could not be reordered', async ({ page }) => {
  await register(page, uniqueUsername('le_reorder'));
  await openTab(page, 'Log');
  await pickExercise(page, 'back squat', 'Back Squat');
  await expect(exerciseCard(page, 'Back Squat').getByRole('button', { name: 'Unpin' })).toBeVisible();
  await pickExercise(page, 'deadlift', 'Deadlift');
  const deadlift = exerciseCard(page, 'Deadlift');
  await expect(deadlift.getByRole('button', { name: 'Up' })).toBeEnabled();
  await failRequests(page, rpc('reorder_pins'), 'POST');

  await deadlift.getByRole('button', { name: 'Up' }).click();

  await expect(page.getByRole('alert')).toHaveText('Could not reorder pins.');
  await page.unroute(rpc('reorder_pins'));
  await page.reload();
  await exerciseCard(page, 'Deadlift').getByRole('button', { name: 'Up' }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(['Deadlift', 'Back Squat']);
});

test('the reveal says it could not load the loot names when the item catalog fails', async ({ page }) => {
  await register(page, uniqueUsername('le_lootnames'));
  await logBench(page);
  await openTab(page, 'Train');
  await failRequests(page, restTable('items'), 'GET');

  await logBench(page, 80);

  const loot = page.getByRole('region', { name: 'Loot' });
  await expect(loot).toContainText("Couldn't load the loot names. See items for what dropped.");
  await expect(loot.getByRole('list', { name: 'Loot drops' })).toHaveCount(0);
});
