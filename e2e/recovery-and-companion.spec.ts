import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { logExercise, logWorkout, openBody, openTab, register, uniqueUsername } from './support/app.ts';
import { grantItems } from './support/db.ts';
import { openItems } from './support/challenge.ts';

function recovery(page: Page) {
  return page.getByRole('region', { name: 'Recovery' });
}

function companion(page: Page, name: string) {
  return page.getByRole('link', { name: `${name}, your companion` });
}

test('the Body page shows which muscles a recent workout trained', async ({ page }) => {
  await register(page, uniqueUsername('rec'));
  await openBody(page);
  await expect(recovery(page)).toContainText('Fresh: Chest, Back, Shoulders, Arms, Legs, Core, Grip');

  await openTab(page, 'Train');
  await logWorkout(page, () =>
    logExercise(page, 'bench', 'Barbell Bench Press', [
      { weightKg: 60, reps: 5 },
      { weightKg: 60, reps: 5 },
      { weightKg: 60, reps: 5 },
    ]),
  );
  await openBody(page);
  await expect(recovery(page).getByRole('listitem').filter({ hasText: 'Recovering:' })).toContainText(
    /Chest \((\d+d( \d+h)?|\d+h)\)/,
  );
  await expect(recovery(page).getByRole('listitem').filter({ hasText: 'Fresh:' })).not.toContainText('Chest');
});

test('the newest pet follows you on Today until you pick another one', async ({ page }) => {
  const username = uniqueUsername('pet');
  await register(page, username);
  await expect(page.getByRole('link', { name: /your companion$/ })).toHaveCount(0);

  await grantItems(username, { spotter_pup: 1 });
  await page.reload();
  await expect(companion(page, 'Spotter Pup')).toBeVisible();

  await grantItems(username, { plate_crab: 1 });
  await page.reload();
  await expect(companion(page, 'Plate Crab')).toBeVisible();

  await openItems(page);
  await page.getByRole('main').getByRole('button', { name: 'Spotter Pup', exact: true }).click();
  const details = page.getByRole('region', { name: 'Item details' });
  await details.getByRole('button', { name: 'Show on Today' }).click();
  await expect(
    page.getByRole('status').getByText('Spotter Pup now follows you on Today', { exact: true }),
  ).toBeVisible();
  await expect(details.getByRole('button', { name: 'Shown on Today' })).toBeDisabled();

  await openTab(page, 'Train');
  await expect(companion(page, 'Spotter Pup')).toBeVisible();
  await companion(page, 'Spotter Pup').click();
  await expect(page.getByRole('heading', { name: 'Pets' })).toBeVisible();
});
