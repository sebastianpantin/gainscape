import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { finishWorkout, logExercise, logWorkout, openLoot, openTab, register, uniqueUsername } from './support/app.ts';
import { activeDropCount, sessionCount } from './support/db.ts';
import {
  dayPicker,
  followProgram,
  MADCOW_FIVE_RMS_KG,
  markEverySetDone,
  programToday,
} from './support/program-enrollment.ts';

const MADCOW = 'Madcow 5x5';

async function startMadcowMonday(page: Page, username: string, before?: () => Promise<void>): Promise<void> {
  await register(page, username);
  if (before) {
    await logWorkout(page, before);
    await openTab(page, 'Train');
  }
  await followProgram(page, MADCOW, MADCOW_FIVE_RMS_KG);
  await programToday(page, MADCOW)
    .getByRole('button', { name: `Start: ${MADCOW} — W1 Day 1`, exact: true })
    .click();
  await expect(page.getByText(`${MADCOW} — W1 Day 1`, { exact: true })).toBeVisible();
}

async function addWednesday(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ Add a program day', exact: true }).click();
  const adding = page.getByRole('region', { name: 'Add a program day', exact: true });
  await expect(dayPicker(adding).getByRole('radio', { name: 'W1 Day 2', exact: true })).toBeChecked();
  await expect(dayPicker(adding).getByRole('radio', { name: 'W1 Day 1', exact: true })).toHaveCount(0);
  await adding.getByRole('button', { name: 'Add W1 Day 2', exact: true }).click();
  await expect(page.getByText(`${MADCOW} — W1 Day 1 + W1 Day 2`, { exact: true })).toBeVisible();
}

test('a program workout takes a second open day and saves one workout per day', async ({ page }) => {
  const username = uniqueUsername('two_days');
  await startMadcowMonday(page, username, () =>
    logExercise(page, 'overhead', 'Overhead Press', [{ weightKg: 20, reps: 5 }]),
  );
  await addWednesday(page);

  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2, name: 'W1 Day 1', exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { level: 2, name: 'W1 Day 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add a program day', exact: true })).toHaveCount(0);

  await markEverySetDone(page);
  await finishWorkout(page);
  await expect(page.getByRole('link', { name: 'Open W1 Day 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open W1 Day 2', exact: true })).toBeVisible();
  await expect.poll(() => sessionCount(username)).toBe(3);
  const sessionIds = await Promise.all(
    ['Open W1 Day 1', 'Open W1 Day 2'].map(async (name) =>
      (await page.getByRole('link', { name, exact: true }).getAttribute('href'))!.split('/').at(-1)!,
    ),
  );
  const dropsPerDay = await Promise.all(sessionIds.map((id) => activeDropCount(id)));
  expect(dropsPerDay[1]).toBeGreaterThan(0);
  await page.reload();
  const loot = await openLoot(page);
  await expect(loot.getByRole('listitem')).toHaveCount(dropsPerDay[0] + dropsPerDay[1]);

  await openTab(page, 'Train');
  const days = dayPicker(programToday(page, MADCOW));
  await expect(days.getByRole('radio', { name: 'W1 Day 3', exact: true })).toBeVisible();
  await expect(days.getByRole('radio', { name: 'W1 Day 1', exact: true })).toHaveCount(0);
  await expect(days.getByRole('radio', { name: 'W1 Day 2', exact: true })).toHaveCount(0);
});

test('removing the added day goes back to one day, and Undo brings it back', async ({ page }) => {
  await startMadcowMonday(page, uniqueUsername('two_days_undo'));
  await addWednesday(page);

  await page.getByRole('button', { name: 'Remove W1 Day 2', exact: true }).click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2, name: 'W1 Day 2', exact: true })).toHaveCount(0);
  await expect(page.getByText(`${MADCOW} — W1 Day 1`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add a program day', exact: true })).toBeVisible();

  await page.getByRole('status').getByRole('button', { name: /^Undo/ }).click();
  await expect(main.getByRole('heading', { level: 2, name: 'W1 Day 2', exact: true })).toBeVisible();
  await expect(page.getByText(`${MADCOW} — W1 Day 1 + W1 Day 2`, { exact: true })).toBeVisible();
});
