import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  finishWorkout,
  logBench,
  logExercise,
  openHistory,
  openLoot,
  openTab,
  register,
  setRow,
} from './support/app.ts';
import { activeDropCount, activeDropsOfLatestSession, grantItems, setDryRolls } from './support/db.ts';
import { openItems } from './support/challenge.ts';

function slot(page: Page, name: string, quantity?: number) {
  const label = quantity === undefined ? `^${name}( ×\\d+)?$` : `^${name} ×${quantity}$`;
  return page.getByRole('main').getByRole('button', { name: new RegExp(label) });
}

test('loot on the reveal, the items screen, crafting and a former scroll variation', async ({ page }) => {
  const username = `loot_${Date.now().toString(36)}`;
  await register(page, username);

  await logBench(page);
  await expect(page.getByRole('region', { name: 'Loot' })).toBeVisible();

  await openTab(page, 'Train');
  await logBench(page, 80);

  await expect
    .poll(async () => (await activeDropsOfLatestSession(username)).some((drop) => drop.source === 'pr'))
    .toBe(true);
  const drops = await activeDropsOfLatestSession(username);
  const loot = await openLoot(page);
  await expect(loot.getByRole('listitem')).toHaveCount(drops.length);
  await expect(loot.getByRole('listitem').filter({ has: page.getByText('PR', { exact: true }) })).toHaveCount(
    drops.filter((drop) => drop.source === 'pr').length,
  );
  await expect(loot.getByRole('img', { name: 'Personal record', exact: true })).toHaveCount(
    drops.filter((drop) => drop.source === 'pr').length,
  );
  await expect(loot).toContainText(drops[0].name);

  await loot.getByRole('link', { name: 'See items' }).click();
  await expect(page.getByRole('heading', { name: 'Gear' })).toBeVisible();
  for (const drop of drops) await expect(slot(page, drop.name).first()).toBeVisible();

  await grantItems(username, { rookie_belt: 1, grinder_scraps: 8 });
  await page.reload();
  await openItems(page);
  await slot(page, 'Rookie belt').click();
  const details = page.getByRole('region', { name: 'Item details' });
  await expect(details).toContainText('Craft into Grinder belt');
  await details.getByRole('button', { name: 'Craft Grinder belt' }).click();
  await expect(slot(page, 'Grinder belt')).toBeVisible();
  await expect(details).toContainText('Grinder belt');
  await expect(details.getByText('Crafted!')).toBeVisible();
  await expect(details).not.toHaveAttribute('aria-live');
  await expect(page.locator('[aria-live="polite"]').getByText('Crafted Grinder belt', { exact: true })).toBeAttached();
  await expect(slot(page, 'Rookie belt', 0)).toBeVisible();
  await expect(slot(page, 'Grinder scraps', 0)).toBeVisible();
  await slot(page, 'Grinder scraps', 0).click();
  await slot(page, 'Grinder belt').click();
  await expect(details.getByText('Crafted!')).toHaveCount(0);

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('pause');
  await expect(page.getByRole('button', { name: /^Pause Squat\b/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pause Bench Press\b/ })).toBeVisible();
  await logExercise(page, 'pause squat', 'Pause Squat', [{ weightKg: 60, reps: 5 }]);
  await finishWorkout(page);

  await openHistory(page);
  await page.getByRole('list', { name: 'Workouts' }).getByRole('link').nth(1).click();
  await expect(page.getByRole('status', { name: 'Workout XP' })).toBeVisible();
  const sessionId = page.url().split('/').at(-1)!;
  await setRow(page, 1)
    .getByRole('spinbutton', { name: /^Reps, set \d+$/ })
    .fill('4');
  const editWarning = page.getByRole('status').filter({ hasText: 'This may remove' });
  await expect(editWarning).toContainText('This may remove');
  await expect(editWarning).toContainText(drops[0].name);
  await expect(editWarning).toContainText('from your collection');
  await page.getByRole('button', { name: 'Undo my changes' }).click();
  await expect(editWarning).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete workout' }).click();
  const deleteWarning = page.getByText(/^This may remove/);
  await expect(deleteWarning).toContainText('This may remove');
  await expect(deleteWarning).toContainText(drops[0].name);
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Workout deleted.')).toBeVisible();
  await expect.poll(() => activeDropCount(sessionId)).toBe(0);
});

test('the luck panel shows the next drop chance and the loot rolls without a drop', async ({ page }) => {
  const username = `luck_${Date.now().toString(36)}`;
  await register(page, username);
  await setDryRolls(username, 3);
  await openItems(page);
  const luck = page.getByRole('region', { name: 'Luck' });
  await expect(luck).toContainText('Next drop chance 19%');
  await expect(luck).toContainText('3 loot rolls without a drop');
  await expect(luck).toContainText('Each loot roll that misses raises the chance, up to 40%.');
  await expect(luck.getByRole('progressbar', { name: 'Next drop chance' })).toHaveAttribute('aria-valuetext', '19%');
});
