import { type Page } from '@playwright/test';
import { expectNoAxeViolations, expectTouchTargets } from './support/a11y.ts';
import { expect, test } from './support/fixtures.ts';
import { logBench, logExercise, openTab, register, uniqueUsername } from './support/app.ts';

const BENCH = 'Barbell Bench Press';

function localDateInDays(page: Page, days: number): Promise<{ iso: string; short: string; long: string }> {
  return page.evaluate((offset) => {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    return {
      iso: day.toLocaleDateString('en-CA'),
      short: day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      long: day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    };
  }, days);
}

async function openBenchProgress(page: Page) {
  await openTab(page, 'Collection');
  await page.getByRole('link', { name: `${BENCH} progress` }).click();
  await expect(page.getByRole('heading', { level: 1, name: BENCH })).toBeVisible();
}

async function saveGoal(page: Page, weightKg: number, reps: number) {
  const goal = page.getByRole('region', { name: 'Goal' });
  await goal.getByRole('spinbutton', { name: 'Goal weight in kg' }).fill(String(weightKg));
  await goal.getByRole('spinbutton', { name: 'Goal reps' }).fill(String(reps));
  await goal.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByRole('status').getByText('Goal saved', { exact: true })).toBeVisible();
}

test('a lift goal is set from the progress screen, shown on Train, edited until achieved and removed', async ({
  page,
}) => {
  await register(page, uniqueUsername('lg'));
  await logBench(page, 60);
  await openTab(page, 'Train');
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lift goals' })).toHaveCount(0);

  await openBenchProgress(page);
  const goal = page.getByRole('region', { name: 'Goal' });
  await goal.getByRole('button', { name: 'Set a goal' }).click();
  const deadline = await localDateInDays(page, 30);
  await goal.getByLabel('Target date (optional)').fill(deadline.iso);
  await expectNoAxeViolations(page, 'lift goal form');
  await expectTouchTargets(page, ['main form input', 'main form button']);
  await saveGoal(page, 100, 5);

  await expect(goal.getByText(`100 kg × 5 by ${deadline.short}`, { exact: true })).toBeVisible();
  await expect(goal.getByRole('progressbar', { name: `${BENCH} goal progress` })).toHaveAttribute(
    'aria-valuenow',
    '60',
  );
  await expect(goal.getByText('Best e1RM 68 kg of 113.33 kg', { exact: true })).toBeVisible();
  await expect(goal.getByText('30 days left', { exact: true })).toBeVisible();
  await expectNoAxeViolations(page, 'lift goal');

  await openTab(page, 'Train');
  const goals = page.getByRole('region', { name: 'Lift goals' });
  await expect(goals.getByText(`100 kg × 5 by ${deadline.short}`, { exact: true })).toBeVisible();
  await expect(goals.getByRole('progressbar', { name: `${BENCH} goal progress` })).toHaveAttribute(
    'aria-valuenow',
    '60',
  );
  await expectTouchTargets(page, ['main a[href]']);
  await goals.getByRole('link', { name: BENCH }).click();
  await expect(page.getByRole('heading', { level: 1, name: BENCH })).toBeVisible();

  await goal.getByRole('button', { name: 'Edit goal' }).click();
  await expect(goal.getByRole('spinbutton', { name: 'Goal weight in kg' })).toHaveValue('100');
  await expect(goal.getByLabel('Target date (optional)')).toHaveValue(deadline.iso);
  await goal.getByLabel('Target date (optional)').fill('');
  await saveGoal(page, 60, 5);
  await expect(goal.getByText('60 kg × 5', { exact: true })).toBeVisible();
  const today = await localDateInDays(page, 0);
  await expect(goal.getByText(`Achieved ${today.long}`, { exact: true })).toBeVisible();
  await expect(goal.getByRole('progressbar', { name: `${BENCH} goal progress` })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );

  await openTab(page, 'Train');
  await expect(goals.getByText(`Achieved ${today.long}`, { exact: true })).toBeVisible();

  await openBenchProgress(page);
  await goal.getByRole('button', { name: 'Remove goal' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove this goal?' });
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('status').getByText('Goal removed', { exact: true })).toBeVisible();
  await expect(goal.getByRole('button', { name: 'Set a goal' })).toBeVisible();

  await openTab(page, 'Train');
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lift goals' })).toHaveCount(0);
});

test('a bodyweight rep exercise offers no goal', async ({ page }) => {
  await register(page, uniqueUsername('lgb'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 8 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();

  await openTab(page, 'Collection');
  await page.getByRole('link', { name: 'Pull-up progress' }).click();
  await expect(page.getByRole('region', { name: 'Most reps' })).toContainText('8 reps');
  await expect(page.getByRole('region', { name: 'Goal' })).toHaveCount(0);
});
