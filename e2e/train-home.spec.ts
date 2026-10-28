import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { expectNoAxeViolations } from './support/a11y.ts';
import { logBench, logExercise, logWorkout, openTab, register, uniqueUsername } from './support/app.ts';
import { activeDropsOfLatestSession, equipGear, grantItems, seedQuestProgress } from './support/db.ts';

test.use({ viewport: { width: 360, height: 780 } });

function thisWeek(page: Page) {
  return page.getByRole('region', { name: 'This week' });
}

function weekStrip(page: Page) {
  return thisWeek(page).getByRole('link', { name: /^This week: .*\. Open Stats$/ });
}

function todayName(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long' });
}

test('the week strip lights today after a workout, opens Stats and stays offline', async ({ page, context }) => {
  await register(page, uniqueUsername('home_week'));
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeInViewport();
  await expect(weekStrip(page)).toHaveAccessibleName('This week: no workouts yet. Open Stats');
  await expect(thisWeek(page)).toContainText('0 workouts this week');
  await expectNoAxeViolations(page, 'train home, new');

  await logBench(page);
  await openTab(page, 'Train');
  await expect(weekStrip(page)).toHaveAccessibleName(
    new RegExp(`^This week: trained (.+ )?${todayName()}\\. Open Stats$`),
  );
  await expect(weekStrip(page).locator('.week-day.today.trained')).toHaveCount(1);
  await expect(thisWeek(page)).toContainText('1 workout this week');
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeInViewport();
  await expectNoAxeViolations(page, 'train home, trained');

  await weekStrip(page).click();
  await expect(page).toHaveURL(/\/collection\/stats$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Collection: Stats', exact: true })).toBeVisible();

  await context.setOffline(true);
  await openTab(page, 'Train');
  await expect(weekStrip(page).locator('.week-day.today.trained')).toHaveCount(1);
  await context.setOffline(false);
});

test('the progress card shows the pet, the gear, the XP to the next level and the quest step', async ({ page }) => {
  const username = uniqueUsername('home_hero');
  await register(page, username);
  await expect(page.getByRole('region', { name: 'Your progress' })).toHaveCount(0);

  await grantItems(username, { spotter_pup: 1, rookie_belt: 1 });
  await equipGear(username, 'rookie_belt');
  await seedQuestProgress(username, 'x_marks_the_squat', { stepIndex: 1, stepProgress: 40 });
  await logBench(page);
  await openTab(page, 'Train');

  const hero = page.getByRole('region', { name: 'Your progress' });
  await expect(hero.getByRole('link', { name: 'Spotter Pup, your companion' })).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Loadout: Rookie belt. Open Items' })).toBeVisible();
  await expect(hero.getByRole('link', { name: /^\w[\w ]* is [\d,]+ XP from level \d+$/ })).toBeVisible();
  await expect(hero.getByRole('progressbar', { name: /^\w[\w ]* XP to level \d+$/ })).toHaveAttribute(
    'aria-valuetext',
    /^[\d,]+ of [\d,]+ XP$/,
  );
  await expect(hero).toContainText('Step 2 of 2: 100 reps of Back Squat in total');
  const quest = hero.getByRole('progressbar', { name: 'X Marks the Squat progress' });
  await expect(quest).toHaveAttribute('aria-valuetext', '40 / 100 reps');
  await expect(quest).toHaveAttribute('aria-valuenow', '70');
  await expectNoAxeViolations(page, 'train home, progress');

  await hero.getByRole('link', { name: 'X Marks the Squat', exact: true }).click();
  await expect(page).toHaveURL(/\/skills\/quests$/);
});

test('highlights show the last workout, the latest record and the rarest drop, each linking on', async ({
  context,
  page,
}) => {
  const username = uniqueUsername('home_high');
  await register(page, username);
  const highlights = page.getByRole('region', { name: 'Highlights' });
  await expect(highlights).toHaveCount(0);

  await logBench(page);
  await openTab(page, 'Train');
  await logBench(page, 80);
  await expect.poll(async () => (await activeDropsOfLatestSession(username)).length).toBeGreaterThan(0);
  await openTab(page, 'Train');

  await expect(highlights.getByRole('link', { name: 'Last workout Today', exact: true })).toBeVisible();
  await expect(highlights.getByRole('link', { name: /^Latest record Barbell Bench Press.* · / })).toBeVisible();
  await expect(
    highlights.getByRole('link', { name: /^Rarest drop, last 30 days .+ · (Common|Uncommon|Rare|Legendary)$/ }),
  ).toBeVisible();
  await expectNoAxeViolations(page, 'train home, highlights');

  await highlights.getByRole('link', { name: /^Latest record/ }).click();
  await expect(page).toHaveURL(/\/collection\/stats\/records$/);
  await openTab(page, 'Train');
  await highlights.getByRole('link', { name: /^Rarest drop/ }).click();
  await expect(page).toHaveURL(/\/collection\/items$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Collection: Items' })).toBeVisible();

  await context.setOffline(true);
  await openTab(page, 'Train');
  await expect(highlights.getByRole('link', { name: 'Last workout Today', exact: true })).toBeVisible();
  await expect(highlights.getByRole('link', { name: /^Latest record Barbell Bench Press.* · / })).toBeVisible();
  await context.setOffline(false);
});

test('the header shows the DOTS level once sex, bodyweight and all three competition lifts are known', async ({
  page,
}) => {
  await register(page, uniqueUsername('home_dots'));
  await openTab(page, 'Profile');
  await page.getByRole('link', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await openTab(page, 'Train');
  await logWorkout(page, async () => {
    await logExercise(page, 'squat', 'Back Squat', [{ weightKg: 100, reps: 5 }]);
    await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 80, reps: 5 }]);
    await logExercise(page, 'deadlift', 'Deadlift', [{ weightKg: 120, reps: 5 }]);
  });
  await openTab(page, 'Train');
  const dots = page.getByRole('main').getByRole('link', { name: /^DOTS \d+$/ });
  await expect(page.getByRole('link', { name: /^Total level \d+ Combat \d+$/ })).toBeVisible();
  await expect(dots).toHaveCount(0);

  await openTab(page, 'Profile');
  await page.getByRole('link', { name: 'Edit profile', exact: true }).click();
  const male = page.getByRole('radiogroup', { name: 'Sex' }).getByRole('radio', { name: 'Male', exact: true });
  await male.press('Enter');
  await expect(male).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await openTab(page, 'Train');
  await expect(dots).toBeVisible();
  const highlights = page.getByRole('region', { name: 'Highlights' });
  await expect(highlights.getByRole('link', { name: 'Last workout Today', exact: true })).toBeVisible();
  await expect(highlights.getByRole('link', { name: /DOTS/ })).toHaveCount(0);
  await expectNoAxeViolations(page, 'train home, DOTS level');
  const level = Number((await dots.textContent())?.replace('DOTS', ''));

  await dots.click();
  await expect(page).toHaveURL(/\/collection\/stats\/strength-level$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Strength level', exact: true })).toBeVisible();
  const current = page.getByRole('region', { name: 'Current level' });
  const score = current.locator('dt:text-is("DOTS") + dd');
  await expect(score).toBeVisible();
  const exactScore = Number(await score.textContent());
  expect(Math.round(exactScore)).toBe(level);
  await expect(current.getByRole('paragraph').filter({ hasText: /^Novice$/ })).toBeVisible();
  await expect(
    current.getByRole('img', { name: `Strength level Novice, DOTS ${exactScore.toFixed(2)}` }),
  ).toBeVisible();
  await expect(current.getByText(/^\d+\.\d\d points to Intermediate$/)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'DOTS over time' }).getByRole('img', { name: /^DOTS over time\./ }),
  ).toBeVisible();
  await expectNoAxeViolations(page, 'strength level');
});
