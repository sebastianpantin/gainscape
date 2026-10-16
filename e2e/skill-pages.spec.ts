import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  bodyLink,
  logExercise,
  logWorkout,
  openSkill,
  openTab,
  register,
  skillCard,
  uniqueUsername,
} from './support/app.ts';
import { failRequests, restTable } from './support/network.ts';

const RECENT_SETS_FAILED = "Couldn't load your recent sets and exercises for recovery and weekly sets.";

const THREE_BENCH_SETS = [
  { weightKg: 60, reps: 5 },
  { weightKg: 60, reps: 5 },
  { weightKg: 60, reps: 5 },
];

function heading(page: Page, name: string) {
  return page.getByRole('heading', { level: 1, name, exact: true });
}

function skillsTab(page: Page) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Skills', exact: true });
}

test('a body skill card opens its page with level, recovery, this week’s sets and exercises', async ({ page }) => {
  await register(page, uniqueUsername('skp_body'));
  await logWorkout(page, () => logExercise(page, 'bench', 'Barbell Bench Press', THREE_BENCH_SETS));

  await openTab(page, 'Skills');
  await skillCard(page, 'Chest').click();
  await expect(page).toHaveURL(/\/skills\/chest$/);
  await expect(heading(page, 'Chest')).toBeFocused();
  await expect(page).toHaveTitle('Skill · Gainscape');
  await expect(skillsTab(page)).toHaveAttribute('aria-current', 'page');

  const level = page.getByRole('region', { name: 'Chest level' });
  await expect(level.getByRole('progressbar', { name: 'Chest progress to next level' })).toBeVisible();
  await expect(level).toContainText(/\d[\d,]* XP \/ \d[\d,]*/);
  await expect(level).toContainText('Counts double toward combat');
  await expect(level).toContainText(/Level 99 at [\d,]+ XP/);

  await expect(page.getByRole('region', { name: 'Recovery' })).toHaveText(/^RecoveryFresh in (\d+d( \d+h)?|\d+h)$/);
  const week = page.getByRole('region', { name: 'Sets this week' });
  await expect(week).toContainText('2.1 of 10 sets');
  await expect(week).not.toContainText('below target');
  const counted = week.getByRole('list', { name: 'Exercises counted for Chest', exact: true }).getByRole('listitem');
  await expect(counted).toHaveCount(1);
  await expect(counted).toContainText('Barbell Bench Press');
  await expect(page.getByRole('list', { name: 'Exercises that train Chest' })).toContainText('Barbell Bench Press 70%');

  await page.getByRole('main').getByRole('link', { name: '‹ Skills', exact: true }).click();
  await expect(heading(page, 'Skills')).toBeVisible();
});

test('a cardio skill page shows its exercises without recovery or weekly sets', async ({ page }) => {
  await register(page, uniqueUsername('skp_cardio'));

  await openSkill(page, 'Endurance');
  await expect(page.getByRole('region', { name: 'Endurance level' })).toContainText('Does not count toward combat');
  await expect(page.getByRole('list', { name: 'Exercises that train Endurance' })).toContainText('Running');
  await expect(page.getByRole('region', { name: 'Recovery' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Sets this week' })).toHaveCount(0);
});

test('the Body link sums up recovery and weekly sets and opens the Body page', async ({ page }) => {
  await register(page, uniqueUsername('skp_sum'));

  await openTab(page, 'Skills');
  await expect(bodyLink(page)).toHaveAccessibleName('Body, All fresh · 0 of 7 at target');
  await bodyLink(page).click();
  await expect(page).toHaveURL(/\/skills\/body$/);
  await expect(heading(page, 'Body')).toBeFocused();
  await expect(skillsTab(page)).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'Recovery' })).toContainText(
    'Fresh: Chest, Back, Shoulders, Arms, Legs, Core, Grip',
  );
  await expect(page.getByRole('region', { name: 'Sets this week' }).getByRole('button')).toHaveCount(7);
});

test('an unknown skill address says so and links back to Skills', async ({ page }) => {
  await register(page, uniqueUsername('skp_none'));

  await page.goto('/skills/no_such_skill');
  await expect(heading(page, 'Skill not found')).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Back to skills', exact: true }).click();
  await expect(heading(page, 'Skills')).toBeVisible();
});

test('a body skill page loads the exercise list once for its exercises, recovery and weekly sets', async ({ page }) => {
  await register(page, uniqueUsername('skp_once'));
  let exerciseReads = 0;
  page.on('request', (request) => {
    if (restTable('exercises').test(request.url()) && request.method() === 'GET') exerciseReads += 1;
  });

  await page.goto('/skills/chest');
  await expect(page.getByRole('list', { name: 'Exercises that train Chest' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recovery' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sets this week' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Loading…', { exact: true })).toHaveCount(0);
  expect(exerciseReads).toBe(1);
});

test('recovery and weekly sets say the same thing when recent sets fail to load', async ({ page }) => {
  await register(page, uniqueUsername('skp_fail'));
  await failRequests(page, restTable('sets'), 'GET');

  await page.goto('/skills/body');
  await expect(heading(page, 'Body')).toBeVisible();
  for (const region of ['Recovery', 'Sets this week']) {
    await expect(page.getByRole('region', { name: region })).toContainText(RECENT_SETS_FAILED);
  }

  await page.goto('/skills/chest');
  await expect(heading(page, 'Chest')).toBeVisible();
  for (const region of ['Recovery', 'Sets this week']) {
    await expect(page.getByRole('region', { name: region })).toContainText(RECENT_SETS_FAILED);
  }
});

test('a skill page that cannot load the skills says so under a heading', async ({ page }) => {
  await failRequests(page, restTable('user_skills'), 'GET');
  await register(page, uniqueUsername('skp_err'));

  await page.goto('/skills/chest');
  await expect(heading(page, 'Skill')).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: '‹ Skills', exact: true })).toBeVisible();
});
