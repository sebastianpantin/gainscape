import { expect, test } from './support/fixtures.ts';
import { openFromProfile, register, uniqueUsername } from './support/app.ts';

test('changing a setting from the keyboard keeps focus on it while the change saves', async ({ page }) => {
  await register(page, uniqueUsername('set_kb'));
  await openFromProfile(page, 'Settings');
  const units = page.getByRole('radiogroup', { name: 'Weight units' });
  const kilograms = units.getByRole('radio', { name: 'Kilograms', exact: true });
  const pounds = units.getByRole('radio', { name: 'Pounds', exact: true });

  await kilograms.focus();
  await page.keyboard.press('ArrowRight');
  await expect(pounds).toHaveAttribute('aria-checked', 'true');
  await expect(pounds).toBeEnabled();
  await expect(pounds).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(kilograms).toHaveAttribute('aria-checked', 'true');
  await expect(kilograms).toBeFocused();

  await page.getByRole('region', { name: 'Privacy' }).getByRole('link', { name: 'What friends see' }).click();
  const showWeights = page.getByRole('switch', { name: 'Show my weights to friends' });
  await expect(showWeights).toHaveAttribute('aria-checked', 'true');
  await showWeights.focus();
  await page.keyboard.press('Space');
  await expect(showWeights).toHaveAttribute('aria-checked', 'false');
  await expect(showWeights).toBeEnabled();
  await expect(showWeights).toBeFocused();
});
