import { expect, test } from './support/fixtures.ts';
import { type Page } from '@playwright/test';
import { expectNoAxeViolations } from './support/a11y.ts';
import {
  addExercise,
  emailOf,
  logBench,
  openFromProfile,
  openTab,
  registerWithoutSigningIn,
  signIn,
  setRow,
  signOut,
  submitSignIn,
  uniqueUsername,
} from './support/app.ts';
import { activeEnrollmentOf, unitPrefOf } from './support/db.ts';
import { restTable } from './support/network.ts';

function firstRun(page: Page) {
  return page.getByRole('dialog');
}

async function signInAsNewUser(page: Page, prefix: string): Promise<string> {
  const username = uniqueUsername(prefix);
  await registerWithoutSigningIn(page, username);
  await submitSignIn(page, emailOf(username));
  await expect(firstRun(page).getByRole('heading', { name: 'Welcome to Gainscape' })).toBeVisible();
  return username;
}

test('a new user sees what they earn, picks pounds and starts an empty workout', async ({ page }) => {
  const username = await signInAsNewUser(page, 'ob_free');
  const dialog = firstRun(page);

  await expect(dialog.getByRole('heading', { name: 'Welcome to Gainscape' })).toBeFocused();
  await expect(dialog.getByText('Step 1 of 3')).toBeVisible();
  const earnings = dialog.getByRole('list', { name: 'What you earn' });
  await expect(earnings.getByRole('listitem')).toHaveText([/^Skills & XP/, /^Records/, /^Loot/]);
  await expect(earnings.getByText(/Skills level up from 1 to 99\./)).toBeVisible();
  await expectNoAxeViolations(page, 'first run welcome');

  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Kilograms or pounds?' })).toBeFocused();
  await dialog.getByRole('radio', { name: 'Pounds', exact: true }).click();
  await expect(dialog.getByRole('radio', { name: 'Pounds', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => unitPrefOf(username)).toBe('lb');
  await expectNoAxeViolations(page, 'first run units');

  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'How do you want to train?' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Follow StrongLifts 5x5', exact: true })).toBeVisible();
  await expectNoAxeViolations(page, 'first run training choice');

  await dialog.getByRole('button', { name: 'Start an empty workout', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search exercises' })).toBeFocused();
  await addExercise(page, 'bench', 'Barbell Bench Press');
  await expect(setRow(page, 1).getByRole('spinbutton', { name: /^Weight in lb, set \d+$/ })).toBeVisible();
});

test.describe('on a 360x740 phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the intro keeps Next in view, Back returns a step and the programs load behind a skeleton', async ({
    page,
  }) => {
    let releaseTemplates: (value: unknown) => void = () => undefined;
    const templatesHeld = new Promise((resolve) => (releaseTemplates = resolve));
    await page.route(restTable('program_templates'), async (route) => {
      await templatesHeld;
      await route.fallback();
    });
    await signInAsNewUser(page, 'ob_small');
    const dialog = firstRun(page);
    const next = dialog.getByRole('button', { name: 'Next', exact: true });

    await expect(next).toBeInViewport({ ratio: 1 });
    await next.click();
    await expect(next).toBeInViewport({ ratio: 1 });
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Welcome to Gainscape' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);

    await next.click();
    await next.click();
    await expect(dialog.getByRole('heading', { name: 'How do you want to train?' })).toBeFocused();
    await expect(dialog.getByRole('status').getByText('Loading…', { exact: true })).toBeAttached();
    releaseTemplates(null);
    await expect(dialog.getByRole('link', { name: 'Follow StrongLifts 5x5', exact: true })).toBeVisible();
    await expect(dialog.getByText('Loading…', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toBeInViewport({ ratio: 1 });
  });
});

test('pounds picked in the intro show in Settings at once, also after the profile was loaded first', async ({
  page,
}) => {
  const username = await signInAsNewUser(page, 'ob_units');
  await page.goto('/profile');
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
  await openTab(page, 'Train');
  const dialog = firstRun(page);

  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Pounds', exact: true }).click();
  await expect(dialog.getByRole('radio', { name: 'Pounds', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => unitPrefOf(username)).toBe('lb');
  await dialog.getByRole('button', { name: 'Skip intro', exact: true }).click();

  await openFromProfile(page, 'Settings');
  await expect(
    page.getByRole('radiogroup', { name: 'Weight units' }).getByRole('radio', { name: 'Pounds', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('a new user can follow the beginner program from the last step', async ({ page }) => {
  const username = await signInAsNewUser(page, 'ob_prog');
  const dialog = firstRun(page);

  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('link', { name: 'Follow StrongLifts 5x5', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Follow StrongLifts 5x5', exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await activeEnrollmentOf(username)).toBeNull();

  await openTab(page, 'Train');
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test('skipping the intro hides it for good, also after signing in again', async ({ page }) => {
  const username = await signInAsNewUser(page, 'ob_skip');

  await firstRun(page).getByRole('button', { name: 'Skip intro', exact: true }).click();
  await expect(firstRun(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeFocused();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await signOut(page);
  await signIn(page, username);
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(firstRun(page)).toHaveCount(0);
});

test('escape skips the intro from any step', async ({ page }) => {
  await signInAsNewUser(page, 'ob_esc');

  await firstRun(page).getByRole('button', { name: 'Next', exact: true }).click();
  await page.keyboard.press('Escape');

  await expect(firstRun(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(firstRun(page)).toHaveCount(0);
});

test('a user who already has workouts never sees the intro on a new device', async ({ page, newPerson }) => {
  const username = await signInAsNewUser(page, 'ob_vet');
  await firstRun(page).getByRole('button', { name: 'Skip intro', exact: true }).click();
  await logBench(page);

  const otherDevice = await newPerson();
  await otherDevice.goto('/');
  await submitSignIn(otherDevice, emailOf(username));
  await expect(otherDevice.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect
    .poll(() =>
      otherDevice.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('gainscape.onboarding.'))),
    )
    .toBe(true);
  await expect(firstRun(otherDevice)).toHaveCount(0);
});

test('a workout started before the intro check answers keeps the intro away', async ({ page }) => {
  const username = uniqueUsername('ob_race');
  await registerWithoutSigningIn(page, username);
  let releaseCheck: () => void = () => undefined;
  const checkHeld = new Promise<void>((resolve) => (releaseCheck = resolve));
  await page.route(/\/rest\/v1\/sessions\?select=id&/, async (route) => {
    const answerBeforeTheWorkout = await route.fetch();
    await checkHeld;
    await route.fulfill({ response: answerBeforeTheWorkout });
  });

  await submitSignIn(page, emailOf(username));
  await logBench(page);
  releaseCheck();
  await openTab(page, 'Train');

  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(firstRun(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(firstRun(page)).toHaveCount(0);
});
