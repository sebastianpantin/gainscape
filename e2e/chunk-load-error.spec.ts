import { expect, test } from './support/fixtures.ts';
import { openTab, register, skillCard, uniqueUsername } from './support/app.ts';

const SKILLS_SCREEN_CHUNK = '**/src/features/skills/SkillsScreen.tsx*';

test('a screen whose code fails to load offers a reload instead of a blank page', async ({ page }) => {
  await page.route(SKILLS_SCREEN_CHUNK, (route) => route.abort());
  await register(page, uniqueUsername('chunk'));

  await openTab(page, 'Skills');
  await expect(page.getByRole('alert')).toHaveText("Couldn't load this screen");
  const reload = page.getByRole('button', { name: 'Reload' });
  await expect(reload).toBeVisible();

  await openTab(page, 'Friends');
  await expect(page.getByRole('heading', { level: 1, name: 'Friends' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await openTab(page, 'Skills');
  await expect(reload).toBeVisible();
  await page.unroute(SKILLS_SCREEN_CHUNK);
  await reload.click();
  await expect(skillCard(page, 'Chest')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
