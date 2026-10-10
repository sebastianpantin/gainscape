import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  addExercise,
  exerciseCard,
  finishWorkout,
  logExercise,
  openFromProfile,
  openTab,
  pauseClockNow,
  register,
  restTimer,
  setRow,
  uniqueUsername,
} from './support/app.ts';

async function chooseRest(page: Page, choice: string) {
  await openTab(page, 'Profile');
  await openFromProfile(page, 'Settings');
  await page.getByRole('radiogroup', { name: 'Rest timer' }).getByRole('radio', { name: choice }).click();
  await openTab(page, 'Train');
}

test('a done set starts a rest that counts down, adjusts, survives a reload and ends', async ({ page }) => {
  await page.clock.install();
  await register(page, uniqueUsername('rt'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(restTimer(page)).toHaveCount(0);

  await pauseClockNow(page);
  await logExercise(page, 'curl', 'Barbell Curl', [{ weightKg: 30, reps: 10 }]);
  const remaining = restTimer(page).getByRole('timer', { name: 'Rest remaining' });
  await expect(remaining).toHaveText('1:30');

  await restTimer(page).getByRole('button', { name: 'Add 15 seconds' }).click();
  await expect(remaining).toHaveText('1:45');
  await expect(restTimer(page).getByRole('button', { name: 'Add 15 seconds' })).toBeFocused();
  await restTimer(page).getByRole('button', { name: 'Remove 15 seconds' }).click();
  await restTimer(page).getByRole('button', { name: 'Remove 15 seconds' }).click();
  await expect(remaining).toHaveText('1:15');

  await page.clock.runFor(15_000);
  await expect(remaining).toHaveText('1:00');
  await page.reload();
  await expect(remaining).toHaveText('1:00');

  await page.clock.runFor(60_000);
  await expect(restTimer(page).getByRole('status')).toHaveText('Rest over');
  await restTimer(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(restTimer(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeFocused();
});

test('the rest length comes from settings, can be skipped or turned off, and ends with the workout', async ({
  page,
}) => {
  await page.clock.install();
  await register(page, uniqueUsername('rs'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await chooseRest(page, '3:00');

  await pauseClockNow(page);
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  const remaining = restTimer(page).getByRole('timer', { name: 'Rest remaining' });
  await expect(remaining).toHaveText('3:00');
  await restTimer(page).getByRole('button', { name: 'Remove 15 seconds' }).click();
  await expect(remaining).toHaveText('2:45');

  const bench = exerciseCard(page, 'Barbell Bench Press');
  await bench.getByRole('button', { name: 'Done set 1' }).click();
  await expect(remaining).toHaveText('2:45');
  await restTimer(page).getByRole('button', { name: 'Skip rest' }).click();
  await expect(restTimer(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeFocused();
  await bench.getByRole('button', { name: 'Done set 1' }).click();
  await expect(restTimer(page).getByRole('timer', { name: 'Rest remaining' })).toHaveText('2:45');

  await page.clock.resume();
  await finishWorkout(page);
  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(restTimer(page)).toHaveCount(0);

  await chooseRest(page, 'Off');
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await expect(bench.getByRole('button', { name: 'Done set 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(restTimer(page)).toHaveCount(0);
});

test('rating a set keeps the rest it started, and focus stays in the bar when the rest ends', async ({ page }) => {
  await page.clock.install();
  await register(page, uniqueUsername('rf'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await pauseClockNow(page);
  const curl = await addExercise(page, 'curl', 'Barbell Curl');
  const remaining = restTimer(page).getByRole('timer', { name: 'Rest remaining' });
  const firstSet = setRow(curl, 1);

  const doneFirstSet = curl.getByRole('button', { name: 'Done set 1' });
  await expect(doneFirstSet).toHaveAttribute('aria-pressed', 'true');
  await doneFirstSet.click();
  await expect(doneFirstSet).toHaveAttribute('aria-pressed', 'false');
  await doneFirstSet.click();
  await expect(remaining).toHaveText('1:30');
  await restTimer(page).getByRole('button', { name: 'Remove 15 seconds' }).click();
  await firstSet.getByRole('radio', { name: 'Hard' }).click();
  await expect(remaining).toHaveText('1:15');

  await curl.getByRole('button', { name: '+ Add set' }).click();
  await setRow(curl, 2).getByRole('radio', { name: 'Hard' }).click();
  await expect(remaining).toHaveText('1:15');

  const removeTime = restTimer(page).getByRole('button', { name: 'Remove 15 seconds' });
  await page.clock.runFor(65_000);
  await removeTime.click();
  await expect(restTimer(page).getByRole('status')).toHaveText('Rest over');
  await expect(removeTime).toBeFocused();
  await expect(removeTime).toHaveAttribute('aria-disabled', 'true');
  await restTimer(page).getByRole('button', { name: 'Add 15 seconds' }).click();
  await expect(remaining).toHaveText('0:15');
});

test('each lift rests for its own length: compound lifts longer, and an adjusted rest is remembered', async ({
  page,
}) => {
  await page.clock.install();
  await register(page, uniqueUsername('rx'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await pauseClockNow(page);
  const bench = exerciseCard(page, 'Barbell Bench Press');
  const curl = exerciseCard(page, 'Barbell Curl');
  const remaining = restTimer(page).getByRole('timer', { name: 'Rest remaining' });

  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await expect(bench.getByText(/Rest 3:00/)).toBeVisible();
  await expect(remaining).toHaveText('3:00');
  await restTimer(page).getByRole('button', { name: 'Add 15 seconds' }).click();
  await expect(remaining).toHaveText('3:15');
  await expect(bench.getByText(/Rest 3:15/)).toBeVisible();

  await logExercise(page, 'curl', 'Barbell Curl', [{ weightKg: 30, reps: 10 }]);
  await expect(curl.getByText(/Rest 1:30/)).toBeVisible();
  await expect(remaining).toHaveText('1:30');

  await page.reload();
  await expect(bench.getByText(/Rest 3:15/)).toBeVisible();
  await bench.getByRole('button', { name: '+ Add set' }).click();
  await setRow(bench, 2).getByRole('radio', { name: 'Hard' }).click();
  await expect(remaining).toHaveText('3:15');
});
