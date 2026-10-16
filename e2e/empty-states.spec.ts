import { expect, test } from './support/fixtures.ts';
import { logCardio, logWorkout, openSkill, openTab, register, uniqueUsername } from './support/app.ts';
import { activeDropsOfLatestSession, grantItems } from './support/db.ts';
import { openItems } from './support/challenge.ts';
import { db } from '../tests/integration/local-stack.ts';

const NOT_FOUND_SLOT = 'Not found yet';

async function catalogItemCount(): Promise<number> {
  const [row] = await db`select count(*)::int as count from public.items where retired_at is null`;
  return row.count;
}

async function gearItemCount(): Promise<number> {
  const [row] = await db`select count(*)::int as count from public.items where retired_at is null and kind = 'gear'`;
  return row.count;
}

test('a short run drops no loot and the reveal says so', async ({ page }) => {
  const username = uniqueUsername('es_noloot');
  await register(page, username);

  await logWorkout(page, () => logCardio(page, 'running', 'Running', [{ minutes: 5, effort: 'Moderate' }]));

  const loot = page.getByRole('region', { name: 'Loot' });
  await expect(loot.getByText('No loot this time', { exact: true })).toBeVisible();
  await expect(loot.getByRole('list', { name: 'Loot drops' })).toHaveCount(0);
  await expect(loot.getByRole('link', { name: 'See items' })).toHaveCount(0);
  expect(await activeDropsOfLatestSession(username)).toEqual([]);
});

test('every item slot is locked as not found yet before the first drop', async ({ page }) => {
  await register(page, uniqueUsername('es_slots'));

  await openItems(page);

  const lockedSlots = page.getByRole('main').getByRole('button', { name: NOT_FOUND_SLOT, exact: true });
  await expect(lockedSlots).toHaveCount(await catalogItemCount());
  await expect(lockedSlots.first()).toBeDisabled();
  await expect(page.getByText(`0/${await gearItemCount()} found`)).toBeVisible();
  await expect(page.getByText('Hard sets can drop items. Finish a workout to find your first one.')).toBeVisible();
});

test('a found item replaces its locked slot', async ({ page }) => {
  const username = uniqueUsername('es_found');
  await register(page, username);
  await grantItems(username, { rookie_belt: 1 });

  await openItems(page);

  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: 'Rookie belt', exact: true })).toBeEnabled();
  await expect(main.getByRole('button', { name: NOT_FOUND_SLOT, exact: true })).toHaveCount(
    (await catalogItemCount()) - 1,
  );
  await expect(page.getByText(`1/${await gearItemCount()} found`)).toBeVisible();
});

test('a skill with no exercises that train it says so', async ({ page }) => {
  await page.route(/\/rest\/v1\/exercises\?/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      : route.fallback(),
  );
  await register(page, uniqueUsername('es_skill'));

  await openSkill(page, 'Chest');

  await expect(page.getByText('No exercises train Chest yet.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Exercises that train Chest' })).toHaveCount(0);
});

test('an empty history offers to start the first workout', async ({ page }) => {
  await register(page, uniqueUsername('es_hist'));

  await openTab(page, 'Collection');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  await expect(page.getByText('No workouts yet. Finish one and it shows up here.')).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Start your first workout', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
});

test('empty records and items link back to the Train screen', async ({ page }) => {
  await register(page, uniqueUsername('es_links'));

  await openTab(page, 'Collection');
  await expect(page.getByText('Log a workout or pin an exercise to start your collection.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Start a workout', exact: true })).toHaveAttribute(
    'href',
    '/',
  );

  await openItems(page);
  await page.getByRole('main').getByRole('link', { name: 'Start a workout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
});
