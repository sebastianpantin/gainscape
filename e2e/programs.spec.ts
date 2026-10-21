import { expect, test } from './support/fixtures.ts';
import {
  doneSetButtons,
  exerciseCard,
  openFromProfile,
  openTab,
  readSession,
  readStoredDraft,
  register,
  setRow,
  setRows,
  uniqueUsername,
} from './support/app.ts';
import { programDayId, sessionRow, setCount } from './support/db.ts';
import { FIVE_THREE_ONE_ONE_RMS_KG, followablePrograms, followProgram } from './support/program-enrollment.ts';

test('copy a template, run a program day with planned sets and finish it', async ({ context, page }) => {
  const username = uniqueUsername('pg');
  await register(page, username);
  const { user } = await readSession(page);

  await openFromProfile(page, 'Programs');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Upper / Lower' })
    .getByRole('button', { name: 'Copy and edit Upper / Lower', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Edit program' })).toBeVisible();
  await page.getByLabel('Program name').fill('My UL');
  await page
    .getByRole('region', { name: 'Day 1' })
    .getByRole('button', { name: 'Remove Cable Triceps Pushdown' })
    .click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your programs' })).toContainText('My UL');

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'My UL — Upper' }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
    'Barbell Bench Press',
    'Barbell Row',
    'Overhead Press',
    'Lat Pulldown',
    'Barbell Curl',
  ]);
  await expect(setRows(page)).toHaveCount(16);
  await expect(doneSetButtons(page)).toHaveCount(0);

  const bench = exerciseCard(page, 'Barbell Bench Press');
  await setRow(bench, 1).getByRole('radio', { name: 'Hard' }).click();
  await expect(setRow(bench, 1).getByRole('button', { name: 'Done set 1' })).toHaveAttribute('aria-pressed', 'false');
  await setRow(bench, 1).getByRole('button', { name: 'Done set 1' }).click();
  await setRow(bench, 2).getByRole('button', { name: 'Done set 2' }).click();
  await setRow(exerciseCard(page, 'Barbell Row'), 1).getByRole('button', { name: 'Done set 1' }).click();
  const toggled = setRow(bench, 3).getByRole('button', { name: 'Done set 3' });
  await toggled.click();
  await expect(toggled).toHaveAttribute('aria-pressed', 'true');
  await toggled.click();
  await expect(toggled).toHaveAttribute('aria-pressed', 'false');
  await expect(doneSetButtons(page)).toHaveCount(3);

  await page.getByRole('button', { name: 'Finish workout' }).click();
  const confirmation = page.getByRole('dialog', { name: '13 sets not ticked' });
  await confirmation.getByRole('button', { name: 'Finish without them' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();

  const stored = await readStoredDraft(page, user.id);
  const sessionId = stored!.syncedSessionId!;
  const upperDayId = await programDayId(username, 'My UL', 'Upper');
  await expect.poll(async () => (await sessionRow(sessionId)).program_day_id).toBe(upperDayId);
  await expect.poll(() => setCount(sessionId)).toBe(3);

  const fresh = await context.newPage();
  await fresh.route('**/rest/v1/programs*', (route) => route.abort());
  await fresh.goto('/');
  await expect(fresh.getByRole('button', { name: 'My UL — Upper' })).toBeVisible();
  await fresh.evaluate((key) => localStorage.removeItem(key), `gainscape.programs.v1.${user.id}`);
  await fresh.reload();
  await expect(fresh.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(fresh.getByText("Couldn't load your programs")).toBeVisible({ timeout: 15_000 });
  await expect(fresh.getByRole('button', { name: 'My UL — Upper' })).toHaveCount(0);
});

test('each template says how often you train, and its button says what it does', async ({ page }) => {
  await register(page, uniqueUsername('pg_tpl'));
  await openFromProfile(page, 'Programs');

  const powerlifting = followablePrograms(page).getByRole('listitem');
  const fiveThreeOne = powerlifting.filter({ has: page.getByText('5/3/1', { exact: true }) });
  await expect(fiveThreeOne.getByText('4 days a week · 4-week cycle', { exact: true })).toBeVisible();
  await expect(fiveThreeOne.getByRole('link', { name: 'Follow 5/3/1', exact: true })).toBeVisible();
  const strongLifts = powerlifting.filter({ has: page.getByText('StrongLifts 5x5', { exact: true }) });
  await expect(strongLifts.getByText('Rotates through 2 workouts', { exact: true })).toBeVisible();

  const upperLower = page
    .getByRole('region', { name: 'Build your own', exact: true })
    .getByRole('listitem')
    .filter({ has: page.getByText('Upper / Lower', { exact: true }) });
  await expect(upperLower.getByText('2 workouts · Upper · Lower', { exact: true })).toBeVisible();
  await expect(upperLower.getByRole('button', { name: 'Copy and edit Upper / Lower', exact: true })).toBeVisible();
});

test('Train offers to follow a program until you say not now', async ({ page }) => {
  await register(page, uniqueUsername('pg_card'));
  const card = page.getByRole('region', { name: 'Follow a program', exact: true });
  await expect(card.getByRole('listitem')).toHaveText([
    /^StrongLifts 5x5Rotates through 2 workouts/,
    /^GZCLP/,
    /^5\/3\/14 days a week · 4-week cycle/,
  ]);
  await expect(page.getByText(/^No programs yet/)).toHaveCount(0);

  await card.getByRole('link', { name: 'Follow 5/3/1', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Follow 5/3/1', exact: true })).toBeVisible();
  await openTab(page, 'Train');
  await card.getByRole('link', { name: 'See all programs', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Programs', exact: true })).toBeVisible();

  await openTab(page, 'Train');
  await card.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText(/^No programs yet/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(page.getByText(/^No programs yet/)).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('Programs puts the program you follow first, then programs to follow, yours and ones to build on', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await register(page, uniqueUsername('pg_order'));
  await openFromProfile(page, 'Programs');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    'Follow a program',
    'Your programs',
    'Build your own',
  ]);
  await expect(main.getByRole('region', { name: 'Active program', exact: true })).toHaveCount(0);

  await followProgram(page, '5/3/1', FIVE_THREE_ONE_ONE_RMS_KG);
  await openFromProfile(page, 'Programs');
  const active = main.getByRole('region', { name: 'Active program', exact: true });
  await expect(active.getByRole('heading', { level: 2 })).toHaveText("You're following 5/3/1");
  await expect(main.getByRole('region')).toHaveText([
    /^You're following 5\/3\/1/,
    /^Follow a program/,
    /^Your programs/,
    /^Build your own/,
  ]);
  await active.getByRole('link', { name: 'Manage program', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '5/3/1', exact: true })).toBeVisible();
});
