import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeViolations, expectTouchTargets } from './support/a11y.ts';
import { logExercise, openFromProfile, openTab, register, signOut } from './support/app.ts';

function uniqueUsername(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

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

test('every signed-in screen has no serious axe violations and the between-set controls are 44px', async ({ page }) => {
  test.setTimeout(180_000);
  await register(page, uniqueUsername('a11y'));
  await checkScreen(page, 'train (empty)', () =>
    expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible(),
  );

  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 8 }]);
  await checkScreen(page, 'train (draft)', () =>
    expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible(),
  );
  await expectTouchTargets(page);
  for (const mode of ['RPE', 'RIR', 'Simple']) {
    await openFromProfile(page, 'Settings');
    await page.getByRole('radio', { name: mode, exact: true }).click();
    await expect(page.getByRole('radio', { name: mode, exact: true })).toHaveAttribute('aria-checked', 'true');
    await openTab(page, 'Train');
    if (mode !== 'Simple') {
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
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByLabel('Bodyweight (kg)')).toBeVisible();
  await expectTouchTargets(page);
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await checkScreen(page, 'reveal', () =>
    expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible(),
  );

  await page.getByRole('link', { name: 'Done' }).click();
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
    ['/profile', null],
    ['/profile/edit', 'Edit profile'],
    ['/profile/preview', null],
    ['/exercises', 'Exercises'],
    ['/programs', 'Programs'],
    ['/profile/settings', 'Settings'],
  ] as const) {
    await page.goto(path);
    await checkScreen(page, path, async () => {
      if (heading) await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      else await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole('main').getByText('Loading…', { exact: true })).toHaveCount(0);
    });
  }

  await page.getByRole('link', { name: 'Licenses' }).click();
  await checkScreen(page, 'licenses', () => expect(page.getByRole('heading', { name: 'Licenses' })).toBeVisible());
  await page.getByRole('link', { name: 'Back to Gainscape' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await signOut(page);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
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

test('the skills screen shows pixel art for the six skills', async ({ page }) => {
  await register(page, uniqueUsername('a11y_sk'));
  await openTab(page, 'Skills');
  const skills = page.getByRole('list').filter({ has: page.getByTestId('skill-chest') });
  await expect(skills.locator('li')).toHaveCount(6);
  await expect(skills.locator('li svg')).toHaveCount(6);
  await expect(skills.locator('.monogram')).toHaveCount(0);
});
