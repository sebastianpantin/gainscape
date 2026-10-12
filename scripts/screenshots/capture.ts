import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Page } from '@playwright/test';
import { expect, test } from '../../e2e/support/fixtures.ts';
import { finishWorkout, logExercise, openTab, register, uniqueUsername } from '../../e2e/support/app.ts';
import { SCREENSHOT_MAX_BYTES, SCREENSHOTS_DIR } from './screens.ts';

const outputDir = join(import.meta.dirname, '../..', SCREENSHOTS_DIR);

async function capture(page: Page, file: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const png = await page.screenshot({ path: join(outputDir, file), animations: 'disabled', caret: 'hide' });
  expect(png.length, file).toBeLessThan(SCREENSHOT_MAX_BYTES);
}

async function showScreen(page: Page, heading: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(page.locator('main[aria-busy="true"], [role="status"]:has-text("Loading")')).toHaveCount(0);
}

test('capture the manifest screenshots', async ({ page }) => {
  mkdirSync(outputDir, { recursive: true });
  await register(page, uniqueUsername('shots'));

  for (const weightKg of [60, 65]) {
    await page.getByRole('button', { name: 'Start workout' }).click();
    await logExercise(page, 'bench', 'Barbell Bench Press', [
      { weightKg, reps: 5 },
      { weightKg, reps: 5 },
    ]);
    await logExercise(page, 'back squat', 'Back Squat', [{ weightKg: weightKg + 30, reps: 5 }]);
    await finishWorkout(page);
    await openTab(page, 'Train');
  }

  await openTab(page, 'Skills');
  await showScreen(page, 'Skills');
  await capture(page, 'skills.png');

  await openTab(page, 'Collection');
  await showScreen(page, 'Collection log');
  await capture(page, 'collection.png');

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [
    { weightKg: 70, reps: 5 },
    { weightKg: 70, reps: 5 },
    { weightKg: 70, reps: 5 },
  ]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, 'train.png');
});
