import { expect, type Page, test } from '@playwright/test';
import { pauseClockNow, register, restTimer, uniqueUsername } from './support/app.ts';
import { workoutCards } from './support/program-enrollment.ts';

const BENCH = 'Barbell Bench Press';
const ROW = 'Barbell Row';

function superset(page: Page) {
  return page.getByRole('region', { name: `Superset: ${BENCH} and ${ROW}` });
}

async function addExercise(page: Page, search: string, exerciseName: string) {
  await page.getByLabel('Search exercises').fill(search);
  await page.getByRole('button', { name: new RegExp(`^${exerciseName}\\b`) }).click();
  await expect(page.getByRole('heading', { name: exerciseName, exact: true })).toBeVisible();
}

async function chooseFromMenu(page: Page, exerciseName: string, action: string) {
  await page.getByLabel(`Exercise menu for ${exerciseName}`, { exact: true }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
}

async function startBenchAndRow(page: Page, prefix: string) {
  await page.clock.install();
  await register(page, uniqueUsername(prefix));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await pauseClockNow(page);
  await addExercise(page, 'bench', BENCH);
  await addExercise(page, 'barbell row', ROW);
}

test('a superset rests only after the last exercise of the round', async ({ page }) => {
  await startBenchAndRow(page, 'ss');
  await chooseFromMenu(page, BENCH, 'Superset with next');
  await expect(superset(page)).toBeVisible();

  const rounds = superset(page).getByRole('list', { name: 'Rounds' });
  const firstRound = rounds.getByRole('listitem', { name: 'Round 1' });
  const doneBench = firstRound.getByRole('button', { name: `Done ${BENCH} round 1` });
  const doneRow = firstRound.getByRole('button', { name: `Done ${ROW} round 1` });
  await doneBench.click();
  await expect(doneBench).toHaveAttribute('aria-pressed', 'false');
  await doneRow.click();
  await expect(doneRow).toHaveAttribute('aria-pressed', 'false');
  await expect(restTimer(page)).toHaveCount(0);

  await doneBench.click();
  await expect(doneBench).toHaveAttribute('aria-pressed', 'true');
  await expect(doneRow).toBeFocused();
  await expect(restTimer(page)).toHaveCount(0);

  await doneRow.click();
  await expect(doneRow).toHaveAttribute('aria-pressed', 'true');
  await expect(restTimer(page).getByRole('timer', { name: 'Rest remaining' })).toHaveText('3:00');

  await superset(page).getByRole('button', { name: '+ Add round' }).click();
  await expect(rounds.getByRole('listitem', { name: 'Round 2' })).toBeVisible();
  await expect(rounds.getByRole('button', { name: `Done ${ROW} round 2` })).toBeVisible();
});

test('grouping two exercises shows one superset card, and ungrouping gives two cards again', async ({ page }) => {
  await startBenchAndRow(page, 'su');
  await expect(superset(page)).toHaveCount(0);

  await chooseFromMenu(page, BENCH, 'Superset with next');
  await expect(superset(page)).toBeVisible();
  await expect(superset(page).getByRole('heading', { name: BENCH, exact: true })).toBeVisible();
  await expect(superset(page).getByRole('heading', { name: ROW, exact: true })).toBeVisible();

  await chooseFromMenu(page, BENCH, 'Ungroup');
  await expect(superset(page)).toHaveCount(0);
  await expect(workoutCards(page, BENCH)).toHaveCount(1);
  await expect(workoutCards(page, ROW)).toHaveCount(1);
  await expect(workoutCards(page, BENCH).getByRole('heading', { name: ROW, exact: true })).toHaveCount(0);
  await expect(workoutCards(page, BENCH).getByRole('button', { name: 'Done set 1' })).toBeVisible();
});
