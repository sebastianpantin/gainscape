import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { logBench, logExercise, openTab, register, uniqueUsername } from './support/app.ts';

const LEVEL_UP_VIBRATION = [40, 50, 40, 50, 140];

type VibrationLog = { vibrations: number[][] };

async function recordVibrations(page: Page) {
  await page.addInitScript(() => {
    const log = window as unknown as VibrationLog;
    log.vibrations = [];
    navigator.vibrate = (pattern: number | Iterable<number>) => {
      log.vibrations.push(typeof pattern === 'number' ? [pattern] : [...pattern]);
      return true;
    };
  });
}

function vibrations(page: Page): Promise<number[][]> {
  return page.evaluate(() => [...(window as unknown as VibrationLog).vibrations]);
}

function skipButton(page: Page) {
  return page.getByRole('button', { name: 'Skip', exact: true });
}

async function skipAsSoonAsTheRevealShows(page: Page, how: 'Skip button' | 'Escape'): Promise<void> {
  await page.evaluate((skipBy) => {
    const observer = new MutationObserver(() => {
      const skip = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Skip');
      if (!skip) return;
      observer.disconnect();
      if (skipBy === 'Skip button') {
        skip.focus();
        skip.click();
      } else setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), 50);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }, how);
}

async function expectChoreographySkipped(page: Page): Promise<void> {
  await expect(skipButton(page)).toHaveCount(0);
  const animationNames = await page
    .locator('.rise, .pop, .gain-added')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
  expect(animationNames.length).toBeGreaterThan(0);
  expect(animationNames.every((name) => name === 'none')).toBe(true);
}

test('skipping jumps the reveal to its end without the level-up cue, and a played reveal cues it', async ({ page }) => {
  await recordVibrations(page);
  await page.clock.install();
  await register(page, uniqueUsername('rv_cue'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 100, reps: 5 }]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 12 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await skipAsSoonAsTheRevealShows(page, 'Skip button');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Level up!' })).toBeVisible();

  await expectChoreographySkipped(page);
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeFocused();
  await page.clock.runFor(3000);
  expect(await vibrations(page)).not.toContainEqual(LEVEL_UP_VIBRATION);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Level up!' })).toBeVisible();
  await expect.poll(() => vibrations(page)).toEqual([LEVEL_UP_VIBRATION]);
  await expect(skipButton(page)).toHaveCount(0);
});

test('loot waits for its own tap after Escape skips the reveal, also under reduced motion, and the keyboard can open it', async ({
  page,
}) => {
  await register(page, uniqueUsername('rv_loot'));
  await logBench(page);
  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 80, reps: 5 }]);
  await skipAsSoonAsTheRevealShows(page, 'Escape');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();

  await expectChoreographySkipped(page);
  const loot = page.getByRole('region', { name: 'Loot' });
  const openLoot = loot.getByRole('button', { name: 'Open loot' });
  await expect(openLoot).toBeVisible();
  await expect(loot.getByRole('list', { name: 'Loot drops' })).toHaveCount(0);

  await openLoot.focus();
  await page.keyboard.press('Enter');
  await expect(openLoot).toHaveCount(0);
  await expect(loot.getByRole('status').getByRole('list', { name: 'Loot drops' })).toBeVisible();
  await expect(loot.getByRole('heading', { name: 'Loot' })).toBeFocused();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(openLoot).toBeVisible();
  await expect(skipButton(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await openLoot.click();
  await expect(loot.getByRole('list', { name: 'Loot drops' })).toBeVisible();
});
