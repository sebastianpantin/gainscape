import { expect, type Page, test } from '@playwright/test';
import { logExercise, openTab, register } from './support/app.ts';
import { activeDropCount, activeDropsOfLatestSession, grantItems, grantUnlock, hasUnlock } from './support/db.ts';

function slot(page: Page, name: string, quantity?: number) {
  const label = quantity === undefined ? `^${name}( ×\\d+)?$` : `^${name} ×${quantity}$`;
  return page.getByRole('main').getByRole('button', { name: new RegExp(label) });
}

async function openItems(page: Page) {
  await openTab(page, 'Log');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'Items' }).click();
  await expect(page.getByRole('heading', { name: 'Gear' })).toBeVisible();
}

test('loot on the reveal, the items screen, crafting and a scroll unlock', async ({ page }) => {
  const username = `loot_${Date.now().toString(36)}`;
  await register(page, username);

  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Loot' })).toBeVisible();

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 80, reps: 5 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();

  const drops = await activeDropsOfLatestSession(username);
  expect(drops.length).toBeGreaterThanOrEqual(1);
  expect(drops.some((drop) => drop.source === 'pr')).toBe(true);
  const loot = page.getByRole('region', { name: 'Loot' });
  await expect(loot.getByRole('listitem')).toHaveCount(drops.length);
  await expect(loot.getByRole('listitem').filter({ has: page.getByText('PR', { exact: true }) })).toHaveCount(
    drops.filter((drop) => drop.source === 'pr').length,
  );
  await expect(loot).toContainText(drops[0].name);

  await loot.getByRole('link', { name: 'See items' }).click();
  await expect(page.getByRole('heading', { name: 'Gear' })).toBeVisible();
  for (const drop of drops) await expect(slot(page, drop.name).first()).toBeVisible();

  await grantItems(username, { rookie_belt: 1, grinder_scraps: 8 });
  await openItems(page);
  await slot(page, 'Rookie belt').click();
  const details = page.getByRole('region', { name: 'Item details' });
  await expect(details).toContainText('Craft into Grinder belt');
  await details.getByRole('button', { name: 'Craft Grinder belt' }).click();
  await expect(slot(page, 'Grinder belt')).toBeVisible();
  await expect(details).toContainText('Grinder belt');
  await expect(slot(page, 'Rookie belt', 0)).toBeVisible();
  await expect(slot(page, 'Grinder scraps', 0)).toBeVisible();

  await grantUnlock(username, 'pause_squat');
  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('pause');
  await expect(page.getByRole('button', { name: /^Pause Squat\b/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pause Bench Press\b/ })).toHaveCount(
    (await hasUnlock(username, 'pause_bench_press')) ? 1 : 0,
  );
  await logExercise(page, 'pause squat', 'Pause Squat', [{ weightKg: 60, reps: 5 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();

  await openTab(page, 'Log');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  await page.getByRole('list', { name: 'Workouts' }).getByRole('link').nth(1).click();
  await expect(page.getByTestId('session-xp')).toBeVisible();
  const sessionId = page.url().split('/').at(-1)!;
  await page.locator('li.set-row').first().getByLabel('reps').fill('4');
  const editWarning = page.getByTestId('edit-loot-warning');
  await expect(editWarning).toContainText('This may remove');
  await expect(editWarning).toContainText(drops[0].name);
  await expect(editWarning).toContainText('from your collection');
  await page.getByRole('button', { name: 'Undo my changes' }).click();
  await expect(editWarning).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete workout' }).click();
  const deleteWarning = page.getByTestId('delete-loot-warning');
  await expect(deleteWarning).toContainText('This may remove');
  await expect(deleteWarning).toContainText(drops[0].name);
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Workout deleted.')).toBeVisible();
  expect(await activeDropCount(sessionId)).toBe(0);
});
