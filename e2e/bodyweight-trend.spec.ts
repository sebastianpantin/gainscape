import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { logExercise, openFromProfile, openTab, register, uniqueUsername } from './support/app.ts';
import { backdateWorkoutsOf } from './support/db.ts';

function trendChart(page: Page) {
  return page.getByRole('img', { name: /^Bodyweight over time\./ });
}

test('the profile charts bodyweight from workouts and from saves without a workout', async ({ page, context }) => {
  const username = uniqueUsername('bw');
  await register(page, username);

  await openTab(page, 'Profile');
  await expect(page.getByText('Save your bodyweight to start a trend.', { exact: true })).toBeVisible();
  await expect(trendChart(page)).toHaveCount(0);

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 8 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await backdateWorkoutsOf(username, 3);

  await openTab(page, 'Profile');
  await expect(trendChart(page)).toHaveAccessibleName(
    'Bodyweight over time. Bodyweight from 80 kg to 80 kg over 2 points.',
  );

  await page.getByRole('button', { name: 'Increase bodyweight by 0.1 kg' }).click();
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Save 80.1 kg' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save 80.1 kg' })).toHaveAccessibleDescription(
    "You're offline. Saving bodyweight needs a connection.",
  );
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Save 80.1 kg' }).click();
  await expect(trendChart(page)).toHaveAccessibleName(
    'Bodyweight over time. Bodyweight from 80 kg to 80.1 kg over 2 points.',
  );

  await openFromProfile(page, 'Settings');
  const pounds = page
    .getByRole('radiogroup', { name: 'Weight units' })
    .getByRole('radio', { name: 'Pounds', exact: true });
  await pounds.click();
  await expect(pounds).toHaveAttribute('aria-checked', 'true');
  await openTab(page, 'Profile');
  await expect(trendChart(page)).toHaveAccessibleName(
    'Bodyweight over time. Bodyweight from 176.4 lb to 176.6 lb over 2 points.',
  );
});
