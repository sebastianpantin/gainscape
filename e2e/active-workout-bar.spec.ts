import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { expectNoAxeViolations } from './support/a11y.ts';
import { recordVibrations, takeVibrations, vibrations } from './support/device.ts';
import {
  finishWorkout,
  logExercise,
  openTab,
  pauseClockNow,
  register,
  restTimer,
  skillLevels,
  uniqueUsername,
} from './support/app.ts';

const REST_OVER_VIBRATION = [200, 100, 200];

function workoutBar(page: Page) {
  return page.getByRole('link', { name: /^Back to workout/ });
}

function skillsList(page: Page) {
  return skillLevels(page);
}

test('an open workout and its rest follow the lifter to other screens, alert there once, and lead back', async ({
  page,
}) => {
  await recordVibrations(page);
  await page.clock.install();
  await register(page, uniqueUsername('awb'));
  await openTab(page, 'Skills');
  await expect(skillsList(page)).toBeVisible();
  await expect(workoutBar(page)).toHaveCount(0);

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await pauseClockNow(page);
  await logExercise(page, 'barbell curl', 'Barbell Curl', [{ weightKg: 30, reps: 10 }]);
  await expect(restTimer(page).getByRole('timer', { name: 'Rest remaining' })).toHaveText('1:30');
  await expect(workoutBar(page)).toHaveCount(0);
  await takeVibrations(page);

  await openTab(page, 'Skills');
  await expect(skillsList(page)).toBeVisible();
  await expect(workoutBar(page)).toContainText('Workout in progress');
  await expect(workoutBar(page)).toContainText('Rest 1:30');
  await expect(workoutBar(page)).toHaveAccessibleName(/^Back to workout, \d+:\d\d elapsed, rest 1:30 left$/);
  await expect(workoutBar(page).locator('[aria-live]')).toHaveCount(0);

  await page.clock.runFor(15_000);
  await expect(workoutBar(page)).toContainText('Rest 1:15');

  await page.clock.runFor(87_000);
  await expect(workoutBar(page)).toContainText('Rest over +0:12');
  await expect.poll(() => vibrations(page)).toEqual([REST_OVER_VIBRATION]);
  await page.clock.resume();
  await expectNoAxeViolations(page, 'skills with the workout bar');

  await workoutBar(page).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(restTimer(page).getByRole('status')).toHaveText('Rest over');
  await expect(workoutBar(page)).toHaveCount(0);
  expect(await vibrations(page)).toEqual([REST_OVER_VIBRATION]);

  await finishWorkout(page);
  await expect(workoutBar(page)).toHaveCount(0);
  await openTab(page, 'Skills');
  await expect(skillsList(page)).toBeVisible();
  await expect(workoutBar(page)).toHaveCount(0);
});

test('a workout started in another tab shows the bar here and goes away when that tab discards it', async ({
  context,
  page,
}) => {
  await register(page, uniqueUsername('awb_mt'));
  await openTab(page, 'Friends');
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Start workout' }).click();

  await expect(workoutBar(page)).toContainText('Workout in progress');
  await second.getByRole('button', { name: 'Discard workout' }).click();
  await second
    .getByRole('dialog', { name: 'Discard this workout?' })
    .getByRole('button', { name: 'Discard workout' })
    .click();
  await expect(second.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(workoutBar(page)).toHaveCount(0);
});
