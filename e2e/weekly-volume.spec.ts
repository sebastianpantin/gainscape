import { expect, test } from './support/fixtures.ts';
import { logBench, openBody, register, uniqueUsername } from './support/app.ts';

test('the Body page counts this week’s sets per muscle and lists the exercises behind them', async ({ page }) => {
  await register(page, uniqueUsername('vol'));
  await logBench(page);
  await openBody(page);

  const volume = page.getByRole('region', { name: 'Sets this week' });
  const chest = volume.getByRole('button', { name: 'Chest 0.7 sets this week · below target', exact: true });
  await expect(chest).toHaveAttribute('aria-expanded', 'false');
  await expect(chest).toContainText('Chest');
  await expect(chest).toContainText('0.7 sets');
  await expect(volume.getByRole('list', { name: 'Exercises counted for Chest', exact: true })).toBeHidden();
  await expect(
    volume.getByRole('button', { name: 'Shoulders 0.2 sets this week · below target', exact: true }),
  ).toBeVisible();
  await expect(volume.getByRole('button', { name: 'Legs 0 sets this week · below target', exact: true })).toBeVisible();

  await chest.click();
  await expect(chest).toHaveAttribute('aria-expanded', 'true');
  const counted = volume.getByRole('list', { name: 'Exercises counted for Chest', exact: true }).getByRole('listitem');
  await expect(counted).toHaveCount(1);
  await expect(counted).toContainText('Barbell Bench Press');
  await expect(counted).toContainText('0.7 sets');

  await volume.getByRole('link', { name: 'Chest skill', exact: true }).click();
  await expect(page).toHaveURL(/\/skills\/chest$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Chest', exact: true })).toBeVisible();
});
