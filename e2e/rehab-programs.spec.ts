import { expect, test } from './support/fixtures.ts';
import { exerciseCard, openFromProfile, openTab, register, setRows, uniqueUsername } from './support/app.ts';

test('a copied rehab program plans timed holds in seconds and starts its day from Train', async ({ page }) => {
  await register(page, uniqueUsername('rehab_pg'));
  await openFromProfile(page, 'Programs');
  const rehab = page.getByRole('region', { name: 'Rehab', exact: true });
  await rehab.getByRole('button', { name: 'Copy and edit Patellar Tendon Rehab', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit program' })).toBeVisible();

  const wallSit = page.getByRole('spinbutton', { name: 'Wall Sit seconds per set', exact: true });
  await expect(wallSit).toHaveValue('45');
  await wallSit.fill('30');
  await wallSit.blur();
  await expect(page.getByRole('radiogroup', { name: 'Leg Extension progression', exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Isometric Leg Extension progression' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const own = page.getByRole('region', { name: 'Your programs' });
  await expect(own).toContainText('Patellar Tendon Rehab');
  await expect(own.getByRole('button', { name: 'Follow Patellar Tendon Rehab' })).toHaveCount(0);

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Patellar Tendon Rehab — Daily' }).click();
  const sit = exerciseCard(page, 'Wall Sit');
  await expect(setRows(sit)).toHaveCount(5);
  await expect(sit.getByRole('spinbutton', { name: 'Seconds, set 1', exact: true })).toHaveValue('30');
  await expect(setRows(exerciseCard(page, 'Leg Extension'))).toHaveCount(3);
});
