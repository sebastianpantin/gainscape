import { expect, test } from './support/fixtures.ts';
import { expectNoAxeViolations } from './support/a11y.ts';
import { definitionOf, logBench, logExercise, logWorkout, openTab, register, uniqueUsername } from './support/app.ts';
import { regularLootTotals, setDryRolls } from './support/db.ts';

test('Stats is a Collection segment: it names the page, keeps Collection lit and leads back to Records', async ({
  page,
}) => {
  await register(page, uniqueUsername('stats_nav'));
  await openTab(page, 'Collection');

  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  await expect(page).toHaveURL(/\/collection\/stats$/);
  await expect(page).toHaveTitle('Stats · Gainscape');
  await expect(page.getByRole('heading', { level: 1, name: 'Collection: Stats', exact: true })).toBeFocused();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Collection', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'Stats', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expectNoAxeViolations(page, 'stats');

  await page
    .getByRole('navigation', { name: 'Collection' })
    .getByRole('link', { name: 'Records', exact: true })
    .click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Collection: Records', exact: true })).toBeVisible();
});

function monthTitleOf(monthsAgo: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

test('the calendar lights today after a workout and the month compare counts it, offline too', async ({
  page,
  context,
}) => {
  await register(page, uniqueUsername('stats_cal'));
  await logBench(page);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  const calendar = page.getByRole('table', { name: monthTitleOf(0), exact: true });
  const today = calendar.locator('td[aria-current="date"]');
  await expect(today).toHaveText(/: 1 workout, [\d,]+ XP$/);
  await expect(today).toHaveClass(/heat-4/);
  await expect(calendar.getByRole('cell', { name: /: no workout$/ }).first()).toBeVisible();

  const compare = page.getByRole('table', { name: `${monthTitleOf(0)} compared with ${monthTitleOf(1)}` });
  await expect(compare.getByRole('row', { name: /^Workouts/ })).toHaveText(/Workouts10\+1/);
  await expect(compare.getByRole('row', { name: /^Volume/ })).toHaveText('Volume300 kg0 kg+300 kg');
  await expectNoAxeViolations(page, 'stats calendar');

  const next = page.getByRole('button', { name: 'Next month', exact: true });
  await expect(next).toBeDisabled();
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page.getByRole('table', { name: monthTitleOf(1), exact: true })).toBeVisible();
  await expect(
    page.getByRole('table', { name: monthTitleOf(1), exact: true }).locator('td.heat-1, td.heat-4'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('table', { name: `${monthTitleOf(1)} compared with ${monthTitleOf(2)}` }).getByRole('row', {
      name: /^Workouts/,
    }),
  ).toHaveText('Workouts00No change');
  await expect(next).toBeEnabled();
  await next.click();
  await expect(calendar).toBeVisible();

  await context.setOffline(true);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();
  await expect(page.getByRole('main').getByText('Offline: showing your saved stats.', { exact: true })).toBeVisible();
  await expect(today).toHaveText(/: 1 workout, [\d,]+ XP$/);
  await context.setOffline(false);
});

function thisWeekLabel(): string {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

test('volume history charts this week of the trained muscle and switches muscle', async ({ page }) => {
  await register(page, uniqueUsername('stats_vol'));
  await logBench(page);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  const history = page.getByRole('region', { name: 'Volume history', exact: true });
  const muscle = history.getByRole('combobox', { name: 'Muscle', exact: true });
  await expect(muscle).toHaveValue('chest');
  await expect(history.getByRole('img', { name: /^Chest working sets per week\. / })).toHaveAccessibleName(
    new RegExp(`, ${thisWeekLabel()} 0\\.7\\.$`),
  );
  await expect(history.getByText('This week: 1 of 10 sets', { exact: true })).toBeVisible();
  await expect(history.getByText(/target is 10 to 20 sets a week per muscle/)).toBeVisible();
  await expectNoAxeViolations(page, 'stats volume history');

  await muscle.selectOption({ label: 'Legs' });
  await expect(history.getByRole('img', { name: /^Legs working sets per week\. / })).toBeVisible();
  await expect(history.getByText('This week: 0 of 10 sets', { exact: true })).toBeVisible();
});

test('recent records list a new best, offline too, and the full timeline by month opens each workout', async ({
  page,
  context,
}) => {
  await register(page, uniqueUsername('stats_prs'));
  await logBench(page, 60);
  await openTab(page, 'Train');
  await logBench(page, 70);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  const recent = page.getByRole('region', { name: 'Recent records', exact: true });
  const record = /^Barbell Bench Press: 5RM 70 kg \(was 60 kg\)/;
  await expect(recent.getByRole('list', { name: 'Recent records' }).getByRole('link', { name: record })).toBeVisible();
  await expectNoAxeViolations(page, 'stats recent records');

  await recent.getByRole('link', { name: 'All records', exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/stats\/records$/);
  await expect(page).toHaveTitle('Records timeline · Gainscape');
  await expect(page.getByRole('heading', { level: 1, name: 'Records timeline', exact: true })).toBeFocused();
  const month = page.getByRole('region', { name: monthTitleOf(0), exact: true });
  await expect(month.getByRole('link', { name: record })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page, 'records timeline');

  await month.getByRole('link', { name: record }).click();
  await expect(page).toHaveURL(/\/collection\/history\/[0-9a-f-]+$/);
  await expect(page.getByRole('status', { name: 'Workout XP' })).toBeVisible();
  await page.goBack();
  await page.getByRole('main').getByRole('link', { name: '‹ Stats', exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/stats$/);

  await context.setOffline(true);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();
  await expect(recent.getByRole('link', { name: record })).toBeVisible();
  await context.setOffline(false);
});

test('the loot section counts the regular rolls and drops of every workout against the odds', async ({ page }) => {
  const username = uniqueUsername('stats_loot');
  await register(page, username);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();
  const loot = page.getByRole('region', { name: 'Loot', exact: true });
  await expect(loot).toContainText('No loot rolls yet. Finish a workout to roll for loot.');

  await openTab(page, 'Train');
  await logBench(page, 60);
  await openTab(page, 'Train');
  await logBench(page, 70);
  const { rolls, drops } = await regularLootTotals(username);
  await setDryRolls(username, 3);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  await expect(loot.getByText(`${rolls} in 2 workouts`, { exact: true })).toBeVisible();
  await expect(loot.getByText(new RegExp(`^${drops}, expected \\d+\\.\\d$`))).toBeVisible();
  await expect(loot.getByText('Drops per workout', { exact: true })).toBeVisible();
  await expect(loot.getByText('3 loot rolls', { exact: true })).toBeVisible();
  await expect(
    loot.getByText(/^(Luckier than expected by|Unluckier than expected by|Right on the odds)/),
  ).toBeVisible();
  await expectNoAxeViolations(page, 'stats loot');
});

test('relative strength charts e1RM per bodyweight and DOTS asks for the sex, then the missing lifts', async ({
  page,
}) => {
  await register(page, uniqueUsername('stats_rel'));
  await openTab(page, 'Profile');
  await page.getByRole('link', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await openTab(page, 'Train');
  await logBench(page, 80);
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  const relative = page.getByRole('region', { name: 'Relative strength' });
  await expect(relative.getByLabel('Lift')).toHaveValue(/.+/);
  await expect(relative.getByRole('option', { name: 'Barbell Bench Press' })).toBeAttached();
  await expect(relative.getByRole('img', { name: /^Barbell Bench Press e1RM per bodyweight\./ })).toBeVisible();
  await expect(relative.getByText('Now 1.23 × bodyweight', { exact: true })).toBeVisible();
  await expect(relative.getByText('Set your sex in Edit profile to see your DOTS score.')).toBeVisible();
  await expectNoAxeViolations(page, 'stats relative strength');

  await relative.getByRole('link', { name: 'Edit profile', exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/edit$/);
  const body = page.getByRole('region', { name: 'Body' });
  await body.getByRole('radiogroup', { name: 'Sex' }).getByRole('radio', { name: 'Male', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();
  await expect(relative.getByText('Log a squat and a deadlift to see your DOTS score.', { exact: true })).toBeVisible();
  await expectNoAxeViolations(page, 'stats DOTS');
  await relative.getByRole('link', { name: 'Strength level', exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/stats\/strength-level$/);
  await expect(page).toHaveTitle('Strength level · Gainscape');
  await expect(page.getByRole('heading', { level: 1, name: 'Strength level', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Current level' })
      .getByText('Log a squat and a deadlift to see your DOTS score.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: '‹ Stats', exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/stats$/);
});

test('the SBD total card shows the estimated and the best lifted total after squat, bench and deadlift', async ({
  page,
}) => {
  await register(page, uniqueUsername('stats_sbd'));
  await logWorkout(page, async () => {
    await logExercise(page, 'squat', 'Back Squat', [{ weightKg: 100, reps: 1 }]);
    await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 80, reps: 1 }]);
    await logExercise(page, 'deadlift', 'Deadlift', [{ weightKg: 120, reps: 1 }]);
  });
  await openTab(page, 'Collection');
  await page.getByRole('main').getByRole('link', { name: 'Stats', exact: true }).click();

  const total = page.getByRole('region', { name: 'Relative strength' }).getByRole('region', { name: 'Total' });
  await expect(total.getByText('Estimated total', { exact: true })).toBeVisible();
  await expect(definitionOf(total, 'Estimated total')).toHaveText(/^\d+(\.\d+)? kg$/);
  await expect(definitionOf(total, 'Best lifted total')).toHaveText(/^300 kg, oldest lift from \d{4}-\d{2}-\d{2}$/);
  await expect(definitionOf(total, 'Squat')).toHaveText(/estimated, 100 kg heaviest$/);
  await expect(definitionOf(total, 'Bench')).toHaveText(/estimated, 80 kg heaviest$/);
  await expect(definitionOf(total, 'Deadlift')).toHaveText(/estimated, 120 kg heaviest$/);
  await expectNoAxeViolations(page, 'stats SBD total');
});
