import { type Browser, expect, type Page, test } from '@playwright/test';
import { expectNoAxeViolations, expectTouchTargets } from './support/a11y.ts';
import { emailOf, logExercise, openFromProfile, openTab, register, signOut, uniqueUsername } from './support/app.ts';
import { grantItems } from './support/db.ts';
import { authLinkFrom, waitForEmail } from './support/mailbox.ts';

const RECOVERY_SUBJECT = 'Reset your Gainscape password';
const TAB_BAR = ['.tab-bar a[href]'];

async function checkScreen(page: Page, screen: string, ready: () => Promise<void>) {
  await ready();
  await expectNoAxeViolations(page, screen);
  if ((await page.locator('.tab-bar').count()) > 0) await expectTouchTargets(page, TAB_BAR);
}

async function finishWithBodyweight(page: Page) {
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
}

async function checkEffortTargets(page: Page) {
  await expectTouchTargets(page);
  for (const mode of ['RPE', 'RIR', 'Simple']) {
    await openFromProfile(page, 'Settings');
    await page.getByRole('radio', { name: mode, exact: true }).click();
    await expect(page.getByRole('radio', { name: mode, exact: true })).toHaveAttribute('aria-checked', 'true');
    await openTab(page, 'Train');
    if (mode === 'Simple') continue;
    const bench = page.locator('section', { has: page.getByRole('heading', { name: 'Barbell Bench Press' }) });
    await bench.getByRole('button', { name: '+ Add set' }).click();
    await expect(bench.getByRole('radiogroup').last()).toHaveAttribute(
      'aria-label',
      mode === 'RPE' ? 'Rate of perceived exertion' : 'Reps in reserve',
    );
    await expectTouchTargets(page);
    await bench
      .getByRole('button', { name: /^Remove set/ })
      .last()
      .click();
  }
}

async function befriend(browser: Browser, page: Page, username: string): Promise<string> {
  const friendName = uniqueUsername('a11y_f');
  const friendContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, ignoreHTTPSErrors: true });
  const friend = await friendContext.newPage();
  await register(friend, friendName);
  await openTab(page, 'Friends');
  await page.getByLabel('Add a friend by exact username').fill(friendName);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('status')).toHaveText(`Request sent to ${friendName}`);
  await openTab(friend, 'Friends');
  await friend.getByTestId('incoming-request').getByRole('button', { name: 'Accept' }).click();
  await expect(friend.getByRole('list', { name: 'Friends list' })).toContainText(username);
  await openTab(friend, 'Train');
  await friend.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(friend, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await friend.getByRole('button', { name: 'Finish workout' }).click();
  await expect(friend.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await friendContext.close();
  return friendName;
}

async function createProgram(page: Page): Promise<string> {
  await openFromProfile(page, 'Programs');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Upper / Lower' })
    .getByRole('button', { name: 'Use this template' })
    .click();
  await expect(page.getByRole('heading', { name: 'Edit program' })).toBeVisible();
  await expectNoAxeViolations(page, 'program editor');
  const editorPath = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your programs' })).toBeVisible();
  return editorPath;
}

test('auth screens have no serious axe violations', async ({ page }) => {
  await page.goto('/');
  await checkScreen(page, 'sign in', () =>
    expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible(),
  );
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await checkScreen(page, 'create account', () =>
    expect(page.getByRole('button', { name: 'Create account' })).toBeVisible(),
  );
  await page.goto('/auth/confirm?token_hash=not-a-real-token&type=email');
  await checkScreen(page, 'auth callback', () =>
    expect(page.getByRole('button', { name: 'Back to sign in' })).toBeVisible(),
  );
});

test('the password reset form has no serious axe violations', async ({ page }) => {
  const username = uniqueUsername('a11y_pw');
  await register(page, username);
  await signOut(page);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await checkScreen(page, 'forgot password', () =>
    expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible(),
  );
  await page.getByLabel('Email').fill(emailOf(username));
  const since = new Date();
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.goto(authLinkFrom(await waitForEmail(emailOf(username), { subject: RECOVERY_SUBJECT, since })));
  await checkScreen(page, 'password reset callback', () =>
    expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible(),
  );
});

test('every signed-in screen has no serious axe violations and the between-set controls are 44px', async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const username = uniqueUsername('a11y');
  await register(page, username);
  await checkScreen(page, 'train (empty)', () =>
    expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible(),
  );

  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 8 }]);
  await checkScreen(page, 'train (draft)', () =>
    expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible(),
  );
  await checkEffortTargets(page);
  await context.setOffline(true);
  await checkScreen(page, 'offline banner', () =>
    expect(page.getByText('Offline. Your workout is saved on this device.')).toBeVisible(),
  );
  await context.setOffline(false);
  await expect(page.getByText('Offline. Your workout is saved on this device.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByLabel('Bodyweight (kg)')).toBeVisible();
  await expectTouchTargets(page);
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await checkScreen(page, 'reveal', () =>
    expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible(),
  );

  await page.getByRole('link', { name: 'Done' }).click();
  await grantItems(username, { rookie_belt: 1, grinder_scraps: 8 });
  const friendName = await befriend(browser, page, username);
  await page.goto('/friends');
  const friendPath = await page
    .getByRole('list', { name: 'Friends list' })
    .getByRole('link', { name: new RegExp(friendName) })
    .getAttribute('href');
  const programPath = await createProgram(page);
  await openTab(page, 'Log');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  const workouts = page.getByRole('list', { name: 'Workouts' }).getByRole('link');
  await expect(workouts).toHaveCount(1);
  const sessionPath = await workouts.first().getAttribute('href');

  for (const [path, heading] of [
    ['/skills', 'Skills'],
    ['/collection', 'Collection log'],
    ['/collection/items', 'Collection log'],
    ['/collection/history', 'Collection log'],
    [sessionPath!, null],
    ['/friends', 'Friends'],
    ['/friends/hiscores', 'Friends'],
    [friendPath!, null],
    ['/profile', null],
    ['/profile/edit', 'Edit profile'],
    ['/profile/preview', null],
    ['/exercises', 'Exercises'],
    ['/programs', 'Programs'],
    [programPath, null],
    ['/profile/settings', 'Settings'],
  ] as const) {
    await page.goto(path);
    await checkScreen(page, path, async () => {
      if (heading) await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      else await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
      await expect(page.getByRole('main').getByText('Loading…', { exact: true })).toHaveCount(0);
    });
  }

  for (const panel of ['Change email', 'Change password', 'Delete account']) {
    const toggle = page.locator('button[aria-expanded]', { hasText: panel });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await checkScreen(page, `settings: ${panel}`, async () => undefined);
  }

  await page.getByRole('link', { name: 'Licenses' }).click();
  await checkScreen(page, 'licenses', () => expect(page.getByRole('heading', { name: 'Licenses' })).toBeVisible());
  await page.getByRole('link', { name: 'Back to Gainscape' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await signOut(page);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test.describe('on a 360x740 phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the between-set controls are 44px in every effort mode', async ({ page }) => {
    await register(page, uniqueUsername('a11y_360'));
    await page.getByRole('button', { name: 'Start workout' }).click();
    await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
    await checkEffortTargets(page);
  });
});

test('the reveal runs no animation under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await register(page, uniqueUsername('a11y_rm'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 100, reps: 5 }]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 12 }]);
  await finishWithBodyweight(page);
  await expect(page.getByRole('heading', { name: 'Level up!' })).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  const opacities = await page
    .locator('.rise, .pop')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity));
  expect(opacities.length).toBeGreaterThan(0);
  expect(opacities.every((opacity) => opacity === '1')).toBe(true);
});

test('the skills screen shows pixel art for the eight skills', async ({ page }) => {
  await register(page, uniqueUsername('a11y_sk'));
  await openTab(page, 'Skills');
  const skills = page.getByRole('list').filter({ has: page.getByTestId('skill-chest') });
  await expect(skills.locator('li')).toHaveCount(8);
  await expect(skills.locator('li svg')).toHaveCount(8);
  await expect(skills.locator('.monogram')).toHaveCount(0);
  await page.getByTestId('skill-endurance').click();
  await expect(page.getByText('does not count toward combat')).toBeVisible();
  await page.getByTestId('skill-chest').click();
  await expect(page.getByText('counts double toward combat')).toBeVisible();
});
