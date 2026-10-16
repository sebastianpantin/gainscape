import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  exerciseCard,
  logBench,
  openFromProfile,
  openLoot,
  openTab,
  pickExercise,
  register,
  registerWithoutSigningIn,
  signIn,
  skipOnboarding,
  uniqueUsername,
} from './support/app.ts';
import { builtInExerciseId, grantItems, seedWorkouts } from './support/db.ts';
import { openItems } from './support/challenge.ts';
import { failRequests, restTable, rpc } from './support/network.ts';

const HISTORY_PAGE_SIZE = 50;
const SEEDED_WORKOUTS = HISTORY_PAGE_SIZE + 5;
const OLDEST_WORKOUT_NOTE = 'oldest seeded workout';
const EVERY_TABLE = /\/sb\/rest\//;
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

function loadoutPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Loadout' });
}

function workoutLinks(page: Page): Locator {
  return page.getByRole('list', { name: 'Workouts' }).getByRole('link');
}

async function openHistory(page: Page) {
  await openTab(page, 'Collection');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
}

async function registerWithWorkouts(page: Page, prefix: string): Promise<void> {
  const username = uniqueUsername(prefix);
  await register(page, username);
  await seedWorkouts(username, SEEDED_WORKOUTS, OLDEST_WORKOUT_NOTE);
  await openHistory(page);
  await expect(workoutLinks(page)).toHaveCount(HISTORY_PAGE_SIZE);
}

test('scrolling to the end of History loads the workouts older than the first page', async ({ page }) => {
  await registerWithWorkouts(page, 'le_more');
  await expect(page.getByText(OLDEST_WORKOUT_NOTE)).toHaveCount(0);

  await workoutLinks(page).last().scrollIntoViewIfNeeded();

  await expect(workoutLinks(page)).toHaveCount(SEEDED_WORKOUTS);
  await expect(workoutLinks(page).last()).toContainText(OLDEST_WORKOUT_NOTE);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});

test('a failed automatic load on History says so and Load more fetches the older workouts', async ({ page }) => {
  await registerWithWorkouts(page, 'le_more_fail');
  const nextPage = /\/rest\/v1\/sessions\?.*or=/;
  await failRequests(page, nextPage, 'GET');

  await workoutLinks(page).last().scrollIntoViewIfNeeded();

  await expect(page.getByRole('alert')).toHaveText('Could not load more workouts.');
  await expect(workoutLinks(page)).toHaveCount(HISTORY_PAGE_SIZE);
  await expect(page.getByRole('button', { name: 'Load more' })).toBeEnabled();

  await page.unroute(nextPage);
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(workoutLinks(page)).toHaveCount(SEEDED_WORKOUTS);
  await expect(page.getByRole('alert')).toHaveCount(0);
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
  await expect(powerlifting.getByRole('link', { name: /^Use / }).first()).toBeVisible();
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

test('pinning an exercise that fails says the pins could not be updated, and pinning again works', async ({ page }) => {
  await register(page, uniqueUsername('le_pin'));
  await openTab(page, 'Collection');
  await failRequests(page, restTable('pinned_exercises'), 'POST');

  await pickExercise(page, 'back squat', 'Back Squat');

  await expect(page.getByRole('alert')).toHaveText('Could not update pins.');
  await expect(page.getByRole('heading', { name: 'Collection: Records', level: 1 })).toBeVisible();
  await expect(page.getByText('Completion', { exact: true })).toBeVisible();
  await page.unroute(restTable('pinned_exercises'));
  await pickExercise(page, 'back squat', 'Back Squat');
  await expect(exerciseCard(page, 'Back Squat').getByRole('button', { name: 'Unpin' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('unpinning an exercise that fails says the pins could not be updated', async ({ page }) => {
  await register(page, uniqueUsername('le_unpin'));
  await openTab(page, 'Collection');
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
  await openTab(page, 'Collection');
  await pickExercise(page, 'back squat', 'Back Squat');
  await expect(exerciseCard(page, 'Back Squat').getByRole('button', { name: 'Unpin' })).toBeVisible();
  await pickExercise(page, 'deadlift', 'Deadlift');
  const deadlift = exerciseCard(page, 'Deadlift');
  await expect(deadlift.getByRole('button', { name: 'Up' })).toBeEnabled();
  await failRequests(page, rpc('reorder_pins'), 'POST');

  await deadlift.getByRole('button', { name: 'Up' }).click();

  await expect(page.getByRole('alert')).toHaveText('Could not reorder pins.');
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(['Back Squat', 'Deadlift']);
  await page.unroute(rpc('reorder_pins'));
  await page.reload();
  await exerciseCard(page, 'Deadlift').getByRole('button', { name: 'Up' }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(['Deadlift', 'Back Squat']);
});

test('the reveal says it could not load the loot names when the item catalog fails', async ({ page }) => {
  await register(page, uniqueUsername('le_lootnames'));
  await failRequests(page, restTable('items'), 'GET');
  await logBench(page);
  await openTab(page, 'Train');

  await logBench(page, 80);

  const loot = await openLoot(page);
  await expect(loot).toContainText("Couldn't load the loot names. See items for what dropped.");
  await expect(loot.getByRole('list', { name: 'Loot drops' })).toHaveCount(0);
});

test('History says it could not connect without waiting out retries, and Try again loads the workouts', async ({
  page,
}) => {
  await register(page, uniqueUsername('le_history'));
  await page.route(EVERY_TABLE, (route) => route.abort('connectionrefused'));

  await page.goto('/collection/history');

  await expect(page.getByRole('heading', { name: 'Collection: History', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute(EVERY_TABLE);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No workouts yet. Finish one and it shows up here.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

async function signInWithEveryTableFailing(page: Page, prefix: string): Promise<void> {
  const username = uniqueUsername(prefix);
  await skipOnboarding(page, await registerWithoutSigningIn(page, username));
  await failRequests(page, EVERY_TABLE);
  await signIn(page, username);
}

const SCREENS_THAT_RETRY_A_FAILED_LOAD: {
  path: string;
  heading: string;
  loaded: (page: Page) => Locator;
}[] = [
  { path: '/skills', heading: 'Skills', loaded: (page) => page.getByRole('list', { name: 'Skill levels' }) },
  {
    path: '/skills/body',
    heading: 'Body',
    loaded: (page) => page.getByRole('heading', { name: 'Recovery', level: 2 }),
  },
  { path: '/skills/chest', heading: 'Skill', loaded: (page) => page.getByRole('heading', { name: 'Chest', level: 1 }) },
  { path: '/skills/quests', heading: 'Quests', loaded: (page) => page.getByRole('heading', { level: 2 }).first() },
  { path: '/profile', heading: 'Profile', loaded: (page) => page.getByRole('link', { name: 'Edit profile' }) },
  {
    path: '/collection',
    heading: 'Collection: Records',
    loaded: (page) => page.getByRole('navigation', { name: 'Collection' }),
  },
  { path: '/profile/settings', heading: 'Settings', loaded: (page) => page.getByRole('heading', { name: 'Privacy' }) },
  { path: '/profile/edit', heading: 'Edit profile', loaded: (page) => page.getByLabel('Display name') },
  {
    path: `/friends/${MISSING_ID}`,
    heading: 'Friend profile',
    loaded: (page) => page.getByRole('heading', { name: 'Not available', level: 1 }),
  },
  {
    path: `/collection/history/${MISSING_ID}`,
    heading: 'Workout',
    loaded: (page) => page.getByText('That workout is no longer there.'),
  },
];

for (const screen of SCREENS_THAT_RETRY_A_FAILED_LOAD) {
  test(`${screen.path} keeps its heading when it cannot load, and Try again loads it`, async ({ page }) => {
    await signInWithEveryTableFailing(page, 'le_retry');

    await page.goto(screen.path);

    await expect(page.getByRole('heading', { name: screen.heading, level: 1 })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'injected failure' }).first()).toBeVisible();
    await page.unroute(EVERY_TABLE);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(screen.loaded(page)).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'injected failure' })).toHaveCount(0);
  });
}
