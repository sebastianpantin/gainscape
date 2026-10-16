import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { expectNoAxeViolations } from './support/a11y.ts';
import { addExercise, logBench, openTab, register, setRow, uniqueUsername } from './support/app.ts';

const BENCH = 'Barbell Bench Press';
const LOGGED = /^Barbell Bench Press, set 1 logged, about [\d,]+ XP$/;

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
  return page.evaluate(() => (window as unknown as VibrationLog).vibrations.splice(0));
}

test('marking a set done drops its XP and announces it with the exercise name, again on a re-log, a new record included', async ({
  page,
}) => {
  await recordVibrations(page);
  await register(page, uniqueUsername('drop'));
  await logBench(page, 60);
  await openTab(page, 'Train');

  await page.getByRole('button', { name: 'Start workout' }).click();
  const row = setRow(await addExercise(page, 'bench', BENCH), 1);
  await row.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ }).fill('60');
  await row.getByRole('spinbutton', { name: /^Reps, set \d+$/ }).fill('5');
  const announcement = page.getByRole('status').filter({ hasText: 'logged' });
  await vibrations(page);

  const done = row.getByRole('button', { name: 'Done set 1' });
  await expect(done).toHaveAttribute('aria-pressed', 'false');
  await expect(announcement).toHaveCount(0);

  await done.click();
  await expect(done).toHaveAttribute('aria-pressed', 'true');
  await expect(announcement).toHaveText(LOGGED);
  expect(await vibrations(page)).toEqual([[12]]);
  await expectNoAxeViolations(page, 'workout after a set is logged');

  const firstAnnouncement = await announcement.locator('span').elementHandle();
  await done.click();
  await expect(done).toHaveAttribute('aria-pressed', 'false');
  await done.click();
  await expect(done).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => firstAnnouncement?.evaluate((node) => node.isConnected)).toBe(false);
  await expect(announcement).toHaveText(LOGGED);
  expect(await vibrations(page)).toEqual([[12]]);

  await done.click();
  await row.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ }).fill('70');
  await done.click();
  await expect(announcement).toHaveText(
    /^Barbell Bench Press, set 1 logged, about [\d,]+ XP\. Predicted new 5 rep max$/,
  );
  await expect(row).toContainText('New 5RM!');
  expect(await vibrations(page)).toEqual([[60, 40, 60]]);
});
