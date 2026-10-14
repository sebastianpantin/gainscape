import { expect, test } from './support/fixtures.ts';
import { logBench, openTab, register, uniqueUsername } from './support/app.ts';

test('the Skills tab counts this week’s sets per muscle and lists the exercises behind them', async ({ page }) => {
  await register(page, uniqueUsername('vol'));
  await logBench(page);
  await openTab(page, 'Skills');

  const volume = page.getByRole('region', { name: 'Sets this week' });
  const chest = volume.getByRole('button', { name: '0.7 sets for Chest this week, below target', exact: true });
  await expect(chest).toHaveAttribute('aria-expanded', 'false');
  await expect(
    volume.getByRole('button', { name: '0.2 sets for Shoulders this week, below target', exact: true }),
  ).toBeVisible();
  await expect(
    volume.getByRole('button', { name: '0 sets for Legs this week, below target', exact: true }),
  ).toBeVisible();

  await chest.click();
  await expect(chest).toHaveAttribute('aria-expanded', 'true');
  const counted = volume.getByRole('list', { name: 'Exercises counted for Chest', exact: true }).getByRole('listitem');
  await expect(counted).toHaveCount(1);
  await expect(counted).toContainText('Barbell Bench Press');
  await expect(counted).toContainText('0.7 sets');
});
