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
import { powerliftingPrograms } from './support/program-enrollment.ts';

test('copy a template, run a program day with planned sets and finish it', async ({ context, page }) => {
  const username = uniqueUsername('pg');
  await register(page, username);
  const { user } = await readSession(page);

  await openFromProfile(page, 'Programs');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Upper / Lower' })
    .getByRole('button', { name: 'Use Upper / Lower', exact: true })
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

test('each template says how often you train, and both template lists start with Use', async ({ page }) => {
  await register(page, uniqueUsername('pg_tpl'));
  await openFromProfile(page, 'Programs');

  const powerlifting = powerliftingPrograms(page).getByRole('listitem');
  const fiveThreeOne = powerlifting.filter({ has: page.getByText('5/3/1', { exact: true }) });
  await expect(fiveThreeOne.getByText('4 days a week · 4-week cycle', { exact: true })).toBeVisible();
  await expect(fiveThreeOne.getByRole('link', { name: 'Use 5/3/1', exact: true })).toBeVisible();
  const strongLifts = powerlifting.filter({ has: page.getByText('StrongLifts 5x5', { exact: true }) });
  await expect(strongLifts.getByText('Rotates through 2 workouts', { exact: true })).toBeVisible();

  const upperLower = page
    .getByRole('region', { name: 'Templates', exact: true })
    .getByRole('listitem')
    .filter({ has: page.getByText('Upper / Lower', { exact: true }) });
  await expect(upperLower.getByText('2 workouts · Upper · Lower', { exact: true })).toBeVisible();
  await expect(upperLower.getByRole('button', { name: 'Use Upper / Lower', exact: true })).toBeVisible();
});
