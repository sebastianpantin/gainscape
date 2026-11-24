import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { type FitActivitySpec, writeFitActivity } from '../tests/web/garmin-fit-file.ts';
import {
  EVERY_CONTROL,
  expectNoAxeViolations,
  expectTouchTargets,
  expectUniqueButtonNamesInLists,
} from './support/a11y.ts';
import { openFromProfile, register, uniqueUsername } from './support/app.ts';
import { boutsOf, liftSetsOf, sessionCount } from './support/db.ts';
import { expect, test } from './support/fixtures.ts';

const HOUR_MS = 60 * 60 * 1000;

function hoursAgoOnTheSecond(hours: number): string {
  return new Date(Math.floor((Date.now() - hours * HOUR_MS) / 1000) * 1000).toISOString();
}

function aTreadmillRun(overrides: Partial<FitActivitySpec> = {}): FitActivitySpec {
  return {
    startedAt: hoursAgoOnTheSecond(20),
    sport: 'running',
    subSport: 'treadmill',
    timerS: 1800,
    distanceM: 5000,
    ...overrides,
  };
}

async function chooseFile(page: Page, path: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import from file' }).click();
  await (await chooser).setFiles(path);
}

function garminSection(page: Page) {
  return page.getByRole('region', { name: 'Garmin' });
}

function workouts(page: Page) {
  return page.getByRole('list', { name: 'Workouts' }).getByRole('link');
}

test('a Garmin activity file goes through the Import review into History, and comes back greyed', async ({ page }) => {
  const username = uniqueUsername('ga_im');
  await register(page, username);
  const file = writeFitActivity('morning-run.fit', aTreadmillRun());
  await openFromProfile(page, 'Settings');
  await expect(garminSection(page)).toContainText('export it as a .fit file');

  await chooseFile(page, file);
  await expect(page.getByRole('heading', { level: 1, name: 'Import review' })).toBeVisible();
  await expect(page.getByText('morning-run.fit · 1 activity')).toBeVisible();
  const run = page.getByRole('listitem').filter({ hasText: 'Treadmill running' });
  await expect(run).toContainText('Running · 30 min · 5 km');
  await expect(run.getByRole('checkbox')).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Select all' })).toBeChecked();
  await expectNoAxeViolations(page, 'Import review');
  await expectTouchTargets(page, EVERY_CONTROL);
  await expectUniqueButtonNamesInLists(page);
  expect(await sessionCount(username)).toBe(0);

  await page.getByRole('button', { name: 'Import 1 workout' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(garminSection(page).getByRole('status')).toContainText(/1 workout earned [\d,]+ XP\./);
  await expect(garminSection(page)).toContainText('Last import:');
  expect(await sessionCount(username)).toBe(1);

  await garminSection(page).getByRole('link', { name: 'See History' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
  await expect(workouts(page)).toHaveCount(1);
  await workouts(page).first().click();
  await expect(page.getByRole('main')).toContainText('Running');

  await openFromProfile(page, 'Settings');
  await chooseFile(page, file);
  const again = page.getByRole('listitem').filter({ hasText: 'Treadmill running' });
  await expect(again).toContainText('Already imported');
  await expect(again.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Select all' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Import 0 workouts' })).toBeDisabled();
  await expectNoAxeViolations(page, 'Import review with a greyed row');
});

test('leaving the Import review saves nothing', async ({ page }) => {
  const username = uniqueUsername('ga_lv');
  await register(page, username);
  await openFromProfile(page, 'Settings');
  await chooseFile(page, writeFitActivity('evening-run.fit', aTreadmillRun()));
  await expect(page.getByRole('button', { name: 'Import 1 workout' })).toBeEnabled();

  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(garminSection(page).getByRole('status')).toHaveCount(0);
  await expect(garminSection(page)).not.toContainText('Last import:');
  expect(await sessionCount(username)).toBe(0);

  await page.goto('/profile/settings/garmin-import');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
});

test('an activity Gainscape maps to no exercise is imported under the exercise the user picks', async ({ page }) => {
  const username = uniqueUsername('ga_pk');
  await register(page, username);
  const file = writeFitActivity('surf.fit', aTreadmillRun({ sport: 'surfing', subSport: 'generic' }));
  await openFromProfile(page, 'Settings');
  await chooseFile(page, file);

  const surf = page.getByRole('listitem').filter({ hasText: 'Surfing' });
  await expect(surf).toContainText('Needs an exercise');
  await expect(surf.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Import 0 workouts' })).toBeDisabled();
  await expectTouchTargets(page, EVERY_CONTROL);

  await surf.getByRole('combobox', { name: /^Exercise for .* · Surfing$/ }).selectOption({ label: 'Rowing' });
  await expect(surf).not.toContainText('Needs an exercise');
  await expect(surf).toContainText('Rowing · 30 min · 5 km');
  await expect(surf.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: 'Import 1 workout' }).click();

  await expect(garminSection(page).getByRole('status')).toContainText(/1 workout earned [\d,]+ XP\./);
  await garminSection(page).getByRole('link', { name: 'See History' }).click();
  await expect(workouts(page)).toHaveCount(1);
  const sessionId = (await workouts(page).first().getAttribute('href'))!.split('/').at(-1)!;
  expect(await boutsOf(sessionId)).toMatchObject([{ duration_s: 1800 }]);
});

function aGymWorkout(overrides: Partial<FitActivitySpec> = {}): FitActivitySpec {
  return {
    startedAt: hoursAgoOnTheSecond(20),
    sport: 'training',
    subSport: 'strengthTraining',
    timerS: 3000,
    laps: [],
    sets: [
      { categories: ['benchPress', 'pushUp', 'flye'], reps: 8, weightKg: 60 },
      { restS: 90 },
      { categories: ['benchPress', 'pushUp', 'flye'], reps: 6, weightKg: 62.5 },
      { restS: 90 },
      { categories: ['unknown', 'unknown', 'row'], reps: 10, weightKg: 0 },
      { restS: 60 },
      { categories: ['pushUp'], reps: 15, weightKg: 0 },
      { categories: ['plank'] },
    ],
    ...overrides,
  };
}

function setGroups(page: Page) {
  return page.getByRole('list', { name: /^Set groups of .* · Strength training$/ }).getByRole('listitem');
}

async function pickGroupExercise(group: ReturnType<typeof setGroups>, search: string, exercise: RegExp) {
  await group.getByRole('button', { name: /^(Choose|Change) exercise for group / }).click();
  await group.getByRole('searchbox', { name: 'Search exercises' }).fill(search);
  await group.getByRole('button', { name: exercise }).click();
}

test('a strength activity is imported set group by set group, and the next one remembers the exercise', async ({
  page,
}) => {
  const username = uniqueUsername('ga_st');
  await register(page, username);
  await openFromProfile(page, 'Settings');
  await chooseFile(page, writeFitActivity('gym.fit', aGymWorkout()));

  const gym = page.getByRole('listitem').filter({ hasText: 'Strength training' });
  await expect(gym).toContainText('4 sets in 4 groups · 50 min');
  await expect(gym).toContainText('Needs exercises');
  await expect(gym.getByRole('checkbox').first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Import 0 workouts' })).toBeDisabled();
  const groups = setGroups(page);
  await expect(groups).toHaveCount(4);
  await expect(groups.nth(0)).toContainText('Bench press');
  await expect(groups.nth(0)).toContainText('8 × 60 kg, 6 × 62.5 kg');
  await expect(groups.nth(1)).toContainText('Unknown exercise');
  await expect(groups.nth(3)).toContainText('1 set left out: no reps, or more than a set can hold.');

  await pickGroupExercise(groups.nth(0), 'barbell bench', /^Barbell Bench Press/);
  await expect(groups.nth(0)).toContainText('Barbell Bench Press');
  await pickGroupExercise(groups.nth(1), 'barbell row', /^Barbell Row/);
  const missingWeight = groups.nth(1).getByRole('spinbutton', { name: /^Weight for set 1 \(kg\), group 2, / });
  await expect(missingWeight).toBeVisible();
  await groups
    .nth(2)
    .getByRole('button', { name: /^Choose exercise for group 3, Push up/ })
    .click();
  await expect(groups.nth(2).getByRole('searchbox', { name: 'Search exercises' })).toBeVisible();
  await expect(gym).toContainText('Needs exercises');
  await expectNoAxeViolations(page, 'Import review with set groups');
  await expectTouchTargets(page, EVERY_CONTROL);
  await expectUniqueButtonNamesInLists(page);

  await groups
    .nth(2)
    .getByRole('checkbox', { name: /^Skip group 3, Push up/ })
    .check();
  await expect(gym).toContainText('Needs a weight');
  await missingWeight.fill('40');
  await expect(gym).not.toContainText('Needs a weight');
  const skipRow = groups.nth(1).getByRole('checkbox', { name: /^Skip group 2, / });
  await skipRow.check();
  await expect(missingWeight).toHaveCount(0);
  await skipRow.uncheck();
  await expect(missingWeight).toHaveValue('40');
  await pickGroupExercise(groups.nth(1), 'barbell row', /^Barbell Row/);
  await expect(missingWeight).toHaveValue('');
  await expect(gym).toContainText('Needs a weight');
  await missingWeight.fill('40');
  await expect(gym.getByRole('checkbox').first()).toBeChecked();
  expect(await sessionCount(username)).toBe(0);
  await page.getByRole('button', { name: 'Import 1 workout' }).click();

  await expect(garminSection(page).getByRole('status')).toContainText(/1 workout earned [\d,]+ XP\./);
  await garminSection(page).getByRole('link', { name: 'See History' }).click();
  await expect(workouts(page)).toHaveCount(1);
  const sessionId = (await workouts(page).first().getAttribute('href'))!.split('/').at(-1)!;
  expect(await liftSetsOf(sessionId)).toEqual([
    { exercise: 'Barbell Bench Press', reps: 8, weight_kg: 60 },
    { exercise: 'Barbell Bench Press', reps: 6, weight_kg: 62.5 },
    { exercise: 'Barbell Row', reps: 10, weight_kg: 40 },
  ]);

  await openFromProfile(page, 'Settings');
  await chooseFile(page, writeFitActivity('gym-again.fit', aGymWorkout({ startedAt: hoursAgoOnTheSecond(4) })));
  const nextGroups = setGroups(page);
  await expect(nextGroups.nth(0)).toContainText('Barbell Bench Press');
  await expect(
    nextGroups.nth(0).getByRole('button', { name: /^Change exercise for group 1, Bench press/ }),
  ).toBeVisible();
  await expect(
    nextGroups.nth(1).getByRole('button', { name: /^Choose exercise for group 2, Unknown exercise/ }),
  ).toBeVisible();

  await nextGroups
    .nth(1)
    .getByRole('checkbox', { name: /^Skip group 2, / })
    .check();
  await pickGroupExercise(nextGroups.nth(2), 'push', /^Push-up/);
  const nextGym = page.getByRole('listitem').filter({ hasText: 'Strength training' });
  await expect(nextGym).toContainText('Needs your bodyweight');
  await page.getByRole('spinbutton', { name: 'Bodyweight (kg)' }).fill('80');
  await page.getByRole('button', { name: 'Save bodyweight' }).click();
  await expect(nextGym).not.toContainText('Needs your bodyweight');
  await expect(nextGym.getByRole('checkbox').first()).toBeChecked();
  await page.getByRole('button', { name: 'Import 1 workout' }).click();
  await expect(garminSection(page).getByRole('status')).toContainText(/1 workout earned [\d,]+ XP\./);
  expect(await sessionCount(username)).toBe(2);
});

test('a file that holds no Garmin activity says so and opens no review', async ({ page }) => {
  await register(page, uniqueUsername('ga_bd'));
  const notFit = join(dirname(writeFitActivity('real.fit', aTreadmillRun())), 'notes.fit');
  writeFileSync(notFit, 'date,type,distance\n2026-11-23,run,5');
  await openFromProfile(page, 'Settings');
  await chooseFile(page, notFit);

  await expect(garminSection(page).getByRole('alert')).toContainText(
    'Could not read a Garmin activity from that file.',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
});
