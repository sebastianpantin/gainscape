import { randomUUID } from 'node:crypto';
import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  emailOf,
  logBench,
  openLatestWorkout,
  openFromProfile,
  register,
  registerWithoutSigningIn,
  skipOnboarding,
  submitSignIn,
  uniqueUsername,
} from './support/app.ts';
import { builtInExerciseId } from './support/db.ts';

const MISSING_PROGRAM = "This program doesn't exist.";
const MISSING_EXERCISE = "This exercise isn't available.";
const GONE_WORKOUT = 'That workout is no longer there.';

function homeUrl(page: Page): RegExp {
  return new RegExp(`^${new URL('/', page.url()).href}$`);
}

async function expectGoneWorkoutNotice(page: Page) {
  await expect(page).toHaveURL(/\/collection\/history$/);
  await expect(page.getByRole('status').filter({ hasText: GONE_WORKOUT })).toHaveText(GONE_WORKOUT);
}

test('an unknown path redirects a signed-in user to the Train screen', async ({ page }) => {
  await register(page, uniqueUsername('dl_unknown'));

  await page.goto('/no/such/screen');

  await expect(page).toHaveURL(homeUrl(page));
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
});

test('an unknown path asks a signed-out visitor to sign in, then lands on the Train screen', async ({ page }) => {
  const username = uniqueUsername('dl_signout');
  await skipOnboarding(page, await registerWithoutSigningIn(page, username));

  await page.goto('/no/such/screen');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  await submitSignIn(page, emailOf(username));
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(page).toHaveURL(homeUrl(page));
});

test('editing a program that does not exist says so', async ({ page }) => {
  await register(page, uniqueUsername('dl_prog'));

  await page.goto(`/programs/${randomUUID()}`);

  await expect(page.getByText(MISSING_PROGRAM)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
});

test('following a program template that does not exist says so', async ({ page }) => {
  await register(page, uniqueUsername('dl_enroll'));

  await page.goto('/programs/enroll/no_such_template');

  await expect(page.getByText(MISSING_PROGRAM)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Follow program');
});

test('a workout link that is not a workout id sends you back to History with a notice', async ({ page }) => {
  await register(page, uniqueUsername('dl_hist_bad'));

  await page.goto('/collection/history/not-a-workout');

  await expectGoneWorkoutNotice(page);
});

test('a workout link to a workout that does not exist sends you back to History with a notice', async ({ page }) => {
  await register(page, uniqueUsername('dl_hist_gone'));

  await page.goto(`/collection/history/${randomUUID()}`);

  await expectGoneWorkoutNotice(page);
});

test("a link to someone else's workout sends you back to History with a notice", async ({ newPerson, page }) => {
  const owner = await newPerson();
  await register(owner, uniqueUsername('dl_hist_own'));
  await logBench(owner);
  await openLatestWorkout(owner);
  const ownersWorkout = new URL(owner.url()).pathname;

  await register(page, uniqueUsername('dl_hist_oth'));
  await page.goto(ownersWorkout);

  await expectGoneWorkoutNotice(page);
});

test('an exercise link that is not an exercise id says the exercise is not available', async ({ page }) => {
  await register(page, uniqueUsername('dl_ex_bad'));

  await page.goto('/collection/exercises/not-an-exercise');

  await expect(page.getByRole('alert')).toHaveText(MISSING_EXERCISE);
  await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();
});

test('an exercise link to an exercise that does not exist says the exercise is not available', async ({ page }) => {
  await register(page, uniqueUsername('dl_ex_gone'));

  await page.goto(`/collection/exercises/${randomUUID()}`);

  await expect(page.getByRole('alert')).toHaveText(MISSING_EXERCISE);
});

test('an exercise link to a cardio activity says the exercise is not available', async ({ page }) => {
  await register(page, uniqueUsername('dl_ex_cardio'));

  await page.goto(`/collection/exercises/${await builtInExerciseId('running')}`);

  await expect(page.getByRole('alert')).toHaveText(MISSING_EXERCISE);
});

test('the Back button on a missing exercise without app history goes to the collection', async ({ page }) => {
  await register(page, uniqueUsername('dl_ex_back'));

  await page.goto('/collection/exercises/not-an-exercise');
  await page.getByRole('button', { name: '‹ Back' }).click();

  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Collection: Records', exact: true })).toBeVisible();
});

test('opening the reveal with no finished workout says there is nothing to show', async ({ page }) => {
  await register(page, uniqueUsername('dl_reveal'));

  await page.goto('/reveal');

  await expect(page.getByText('No finished workout to show yet.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to workout' }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
});

test('opened by a deep link, Programs and the program screens light Train, Custom exercises lights Profile, and Back leads to the parent', async ({
  page,
}) => {
  await register(page, uniqueUsername('dl_prof'));
  const mainTab = (name: string) =>
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });
  const screens = [
    { path: '/programs', heading: 'Programs', tab: 'Train', backTo: /\/profile$/ },
    { path: '/exercises', heading: 'Custom exercises', tab: 'Profile', backTo: /\/profile$/ },
    {
      path: '/programs/enroll/stronglifts_5x5',
      heading: 'Follow StrongLifts 5x5',
      tab: 'Train',
      backTo: /\/programs$/,
    },
  ];
  for (const { path, heading, tab, backTo } of screens) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(mainTab(tab)).toHaveAttribute('aria-current', 'page');
      await page.getByRole('main').getByRole('button', { name: '‹ Back', exact: true }).click();
      await expect(page).toHaveURL(backTo);
    });
  }
});

test('Back from a child screen returns through the screens you came from, without looping', async ({ page }) => {
  await register(page, uniqueUsername('dl_loop'));
  await openFromProfile(page, 'Programs');
  await page.getByRole('button', { name: 'New program' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New program', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/programs$/);
  await page.getByRole('main').getByRole('button', { name: '‹ Back', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('Quests leads back to Skills', async ({ page }) => {
  await register(page, uniqueUsername('dl_quest'));
  await page.goto('/skills/quests');
  await expect(page.getByRole('heading', { level: 1, name: 'Quests', exact: true })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: '‹ Skills', exact: true }).click();
  await expect(page).toHaveURL(/\/skills$/);
});
