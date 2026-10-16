import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { expectNoAxeViolations, expectRemoveSetButtonsStandApart, expectTouchTargets } from './support/a11y.ts';
import {
  emailOf,
  exerciseCard,
  logBench,
  logCardio,
  logExercise,
  logWorkout,
  openFromProfile,
  openTab,
  readSession,
  register,
  setRow,
  signOut,
  skillCard,
  skillLevels,
  uniqueUsername,
} from './support/app.ts';
import { activeEnrollmentIdOf, equipGear, grantItems } from './support/db.ts';
import {
  CHALLENGE_NAME,
  finishWithBodyweight,
  logDeadliftToFailure,
  markEveryRoundDone,
  openItems,
  SCROLL_KEY,
  scrollSlot,
  shortenFirstDeadliftSet,
  startChallenge,
} from './support/challenge.ts';
import { authLinkFrom, RECOVERY_SUBJECT, waitForEmail } from './support/mailbox.ts';
import {
  createSquatAndBenchProgram,
  FIVE_THREE_ONE_ONE_RMS_KG,
  fillProgramInputs,
  followProgram,
  openEnrollForm,
  openOwnProgramFollowForm,
  programToday,
  startFollowing,
} from './support/program-enrollment.ts';
import { seedFiveThreeOneCycleSkippingPress } from './support/program-seed.ts';

test.describe.configure({ mode: 'parallel' });

const TAB_BAR = ['.tab-bar a[href]'];

async function checkScreen(page: Page, screen: string, ready: () => Promise<void>) {
  await ready();
  await expectNoAxeViolations(page, screen);
  if ((await page.locator('.tab-bar').count()) > 0) await expectTouchTargets(page, TAB_BAR);
}

async function checkEffortTargets(page: Page) {
  await expectTouchTargets(page);
  await expectRemoveSetButtonsStandApart(page);
  for (const mode of ['RPE', 'RIR', 'Simple']) {
    await openFromProfile(page, 'Settings');
    await page.getByRole('radio', { name: mode, exact: true }).click();
    await expect(page.getByRole('radio', { name: mode, exact: true })).toHaveAttribute('aria-checked', 'true');
    await openTab(page, 'Train');
    if (mode === 'Simple') continue;
    const bench = exerciseCard(page, 'Barbell Bench Press');
    await bench.getByRole('button', { name: '+ Add set' }).click();
    await expect(bench.getByRole('radiogroup').last()).toHaveAttribute(
      'aria-label',
      mode === 'RPE' ? 'Rate of perceived exertion' : 'Reps in reserve',
    );
    await expectTouchTargets(page);
    await expectRemoveSetButtonsStandApart(page);
    await bench
      .getByRole('button', { name: /^Set \d+ options$/ })
      .last()
      .click();
    await bench.getByRole('button', { name: /^Remove set/ }).click();
  }
}

async function befriend(friend: Page, page: Page, username: string): Promise<string> {
  const friendName = uniqueUsername('a11y_f');
  await register(friend, friendName);
  await openTab(page, 'Friends');
  await page.getByLabel('Add a friend by exact username').fill(friendName);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('status').getByText(`Request sent to ${friendName}`, { exact: true })).toBeVisible();
  await openTab(friend, 'Friends');
  await friend.getByRole('button', { name: 'Accept' }).click();
  await expect(friend.getByRole('list', { name: 'Friends list' })).toContainText(username);
  await openTab(friend, 'Train');
  await logWorkout(friend, () => logExercise(friend, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]));
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
  await page
    .getByRole('radiogroup', { name: / progression$/ })
    .first()
    .getByRole('radio', { name: 'Add weight' })
    .click();
  await expect(page.getByLabel('Increment (kg)')).toBeVisible();
  await expectNoAxeViolations(page, 'program editor with add weight');
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

type Screen = readonly [path: string, heading: string | null];

async function checkScreens(page: Page, screens: readonly Screen[]) {
  for (const [path, heading] of screens) {
    await page.goto(path);
    await checkScreen(page, path, async () => {
      if (heading) await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      else await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
      await expect(page.getByRole('main').getByText('Loading…', { exact: true })).toHaveCount(0);
    });
  }
}

test.describe('signed-in screens', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the workout screens have no serious axe violations and the between-set controls are 44px', async ({
    context,
    page,
  }) => {
    test.setTimeout(150_000);
    await register(page, uniqueUsername('a11y'));
    await checkScreen(page, 'train (empty)', () =>
      expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible(),
    );

    await page.getByRole('button', { name: 'Start workout' }).click();
    await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
    await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 8 }]);
    await logCardio(page, 'running', 'Running', [{ minutes: 30, distance: 5, effort: 'Moderate' }]);
    await logCardio(page, 'sprint', 'Sprint Intervals', [{ rounds: 10, workS: 30, restS: 30, effort: 'Hard' }]);
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
  });

  test('the skills, collection, history and progress screens have no serious axe violations', async ({ page }) => {
    test.setTimeout(150_000);
    const username = uniqueUsername('a11y_log');
    await register(page, username);
    await grantItems(username, { rookie_belt: 1, grinder_scraps: 8, ascendant_gloves: 1 });
    await equipGear(username, 'ascendant_gloves');
    await logBench(page);
    await checkScreen(page, 'reveal (gear bonus)', () =>
      expect(page.getByText(/^Gear bonus \+\d+ XP$/).first()).toBeVisible(),
    );
    await openTab(page, 'Collection');
    await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
    const workouts = page.getByRole('list', { name: 'Workouts' }).getByRole('link');
    await expect(workouts).toHaveCount(1);
    const sessionPath = await workouts.first().getAttribute('href');
    await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'Records' }).click();
    const progressPath = await page.getByRole('link', { name: 'Barbell Bench Press progress' }).getAttribute('href');

    await checkScreens(page, [
      ['/skills', 'Skills'],
      ['/skills/quests', 'Quests'],
      ['/skills/endurance', 'Endurance'],
      ['/skills/no_such_skill', 'Skill not found'],
      ['/collection', 'Collection: Records'],
      ['/collection/items', 'Collection: Items'],
      ['/collection/history', 'Collection: History'],
      [sessionPath!, null],
      [progressPath!, 'Barbell Bench Press'],
    ]);

    await page.goto('/skills/chest');
    await checkScreen(page, 'skill page (chest)', async () => {
      await expect(page.getByRole('list', { name: 'Exercises that train Chest' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Recovery' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Sets this week' })).toBeVisible();
      await expect(page.getByRole('main').getByText('Loading…', { exact: true })).toHaveCount(0);
    });

    await page.goto('/skills/body');
    await checkScreen(page, 'body (chest opened)', async () => {
      await expect(page.getByRole('region', { name: 'Recovery' })).toBeVisible();
      const volume = page.getByRole('region', { name: 'Sets this week' });
      await volume.getByRole('button', { name: /^Chest\b/ }).click();
      await expect(volume.getByRole('link', { name: 'Chest skill', exact: true })).toBeVisible();
    });
  });

  test('the challenge screens have no serious axe violations', async ({ page }) => {
    test.setTimeout(150_000);
    const username = uniqueUsername('a11y_ch');
    await register(page, username);
    await logDeadliftToFailure(page, 140);
    await grantItems(username, { [SCROLL_KEY]: 1 });
    await openItems(page);
    await checkScreen(page, 'items (scroll picked)', async () => {
      await scrollSlot(page).click();
      await expect(page.getByRole('button', { name: 'Start challenge' })).toBeEnabled();
    });

    await startChallenge(page);
    await checkScreen(page, 'train (challenge superset)', () =>
      expect(page.getByRole('region', { name: 'Challenge', exact: true })).toBeVisible(),
    );
    await markEveryRoundDone(page);
    await finishWithBodyweight(page);
    await checkScreen(page, 'reveal (challenge complete)', () =>
      expect(page.getByText(`Challenge complete: ${CHALLENGE_NAME}`)).toBeVisible(),
    );

    await grantItems(username, { [SCROLL_KEY]: 1 });
    await openItems(page);
    await startChallenge(page);
    await shortenFirstDeadliftSet(page, 4);
    await markEveryRoundDone(page);
    await page.getByRole('button', { name: 'Finish workout' }).click();
    await checkScreen(page, 'reveal (challenge failed)', () =>
      expect(page.getByText(`Challenge failed: ${CHALLENGE_NAME}`)).toBeVisible(),
    );
  });

  test('the friends and profile screens have no serious axe violations', async ({ newPerson, page }) => {
    test.setTimeout(150_000);
    const username = uniqueUsername('a11y_fr');
    await register(page, username);
    await grantItems(username, { rookie_belt: 1 });
    await equipGear(username, 'rookie_belt');
    const friendName = await befriend(await newPerson(), page, username);
    await page.goto('/friends');
    const friendPath = await page
      .getByRole('list', { name: 'Friends list' })
      .getByRole('link', { name: new RegExp(friendName) })
      .getAttribute('href');

    await checkScreens(page, [
      ['/friends', 'Friends'],
      ['/friends/hiscores', 'Friends'],
      [friendPath!, friendName],
      ['/profile', null],
      ['/profile/edit', 'Edit profile'],
      ['/profile/preview', null],
    ]);
  });

  test('the exercises, programs and settings screens have no serious axe violations', async ({ page }) => {
    test.setTimeout(240_000);
    await register(page, uniqueUsername('a11y_set'));
    const programPath = await createProgram(page);

    await checkScreens(page, [
      ['/exercises', 'Exercises'],
      ['/programs', 'Programs'],
      [programPath, null],
      ['/profile/settings/whats-new', "What's new"],
      ['/profile/settings', 'Settings'],
    ]);

    for (const panel of ['Change email', 'Change password', 'Delete account']) {
      await page.getByRole('button', { name: panel, exact: true, expanded: false }).click();
      await expect(page.getByRole('button', { name: panel, exact: true, expanded: true })).toBeVisible();
      await checkScreen(page, `settings: ${panel}`, async () => undefined);
    }

    await page.getByRole('link', { name: 'Licenses' }).click();
    await checkScreen(page, 'licenses', () => expect(page.getByRole('heading', { name: 'Licenses' })).toBeVisible());
    await page.getByRole('link', { name: 'Back to Gainscape' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 15_000 });
    await signOut(page);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });
});

test('the links on Train are 44px tall', async ({ page }) => {
  test.setTimeout(150_000);
  await register(page, uniqueUsername('a11y_links'));
  await logBench(page);
  await openTab(page, 'Train');
  await expect(page.getByRole('link', { name: /^\w[\w ]* is [\d,]+ XP from level \d+$/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Copy a template', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit programs', exact: true })).toBeVisible();
  await expectTouchTargets(page, ['main a[href]']);

  await openEnrollForm(page, '5/3/1');
  await fillProgramInputs(page, FIVE_THREE_ONE_ONE_RMS_KG);
  await startFollowing(page, '5/3/1');
  await expect(programToday(page, '5/3/1').getByRole('link', { name: 'Manage program', exact: true })).toBeVisible();
  await expectTouchTargets(page, ['main a[href]']);
});

test('the program enrollment screens have no serious axe violations', async ({ page }) => {
  test.setTimeout(150_000);
  await register(page, uniqueUsername('a11y_pe'));
  await openEnrollForm(page, '5/3/1');
  await checkScreen(page, 'program enroll form', () =>
    expect(page.getByRole('button', { name: 'Start following', exact: true })).toBeVisible(),
  );
  await fillProgramInputs(page, FIVE_THREE_ONE_ONE_RMS_KG);
  await startFollowing(page, '5/3/1');
  const startSquat = programToday(page, '5/3/1').getByRole('button', {
    name: 'Start: 5/3/1 — C1 W1 Day 1',
    exact: true,
  });
  await checkScreen(page, 'train (program today)', () => expect(startSquat).toBeVisible());

  await programToday(page, '5/3/1').getByRole('link', { name: 'Manage program', exact: true }).click();
  await checkScreen(page, 'manage program', () =>
    expect(page.getByRole('heading', { level: 1, name: '5/3/1', exact: true })).toBeVisible(),
  );

  await page.getByRole('link', { name: 'See the plan', exact: true }).click();
  await checkScreen(page, 'program plan', () =>
    expect(page.getByRole('heading', { level: 1, name: '5/3/1 plan', exact: true })).toBeVisible(),
  );

  await openTab(page, 'Train');
  await programToday(page, '5/3/1').getByRole('button', { name: 'Skip C1 W1 Day 1', exact: true }).click();
  const skipDialog = page.getByRole('dialog', { name: 'Skip C1 W1 Day 1?', exact: true });
  await checkScreen(page, 'skip day dialog', () => expect(skipDialog).toBeVisible());
  await skipDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(skipDialog).toHaveCount(0);

  await startSquat.click();
  await checkScreen(page, 'train (program draft)', () =>
    expect(page.getByText('5/3/1 — C1 W1 Day 1', { exact: true })).toBeVisible(),
  );
  await expectTouchTargets(page);
});

test('the follow form of your own program has no serious axe violations', async ({ page }) => {
  await register(page, uniqueUsername('a11y_pc'));
  await createSquatAndBenchProgram(page, 'My Squat 5x5');
  await openOwnProgramFollowForm(page, 'My Squat 5x5');
  await checkScreen(page, 'own program follow form', () =>
    expect(page.getByLabel('Back Squat working weight (kg)', { exact: true })).toBeVisible(),
  );
});

test('the program cycle summary has no serious axe violations', async ({ page }) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('a11y_ps');
  await register(page, username);
  await followProgram(page, '5/3/1', FIVE_THREE_ONE_ONE_RMS_KG);
  const { access_token: accessToken } = await readSession(page);
  await seedFiveThreeOneCycleSkippingPress(accessToken, await activeEnrollmentIdOf(username));
  await page.reload();
  await checkScreen(page, 'train (cycle summary)', () =>
    expect(page.getByRole('region', { name: 'Cycle 1 complete', exact: true })).toBeVisible(),
  );
  await expectTouchTargets(page);
});

test.describe('on a 360x740 phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the between-set controls are 44px in every effort mode', async ({ page }) => {
    await register(page, uniqueUsername('a11y_360'));
    await page.getByRole('button', { name: 'Start workout' }).click();
    await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
    await logCardio(page, 'sprint', 'Sprint Intervals', [{ rounds: 10, workS: 30, restS: 30, effort: 'Hard' }]);
    await checkEffortTargets(page);
  });
});

test.describe('on a 320x640 phone', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('every tab label fits inside its tab', async ({ page }) => {
    await register(page, uniqueUsername('a11y_320'));
    const tabs = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
    await expect(tabs).toHaveText(['Train', 'Skills', 'Collection', 'Friends', 'Profile']);
    for (const tab of await tabs.all()) {
      const overflow = await tab.evaluate((link) => link.scrollWidth - link.clientWidth);
      expect(overflow, await tab.innerText()).toBeLessThanOrEqual(0);
    }
  });

  test('a lift set row keeps a usable weight field and nothing in the workout clips or overflows', async ({ page }) => {
    await register(page, uniqueUsername('a11y_320w'));
    await page.getByRole('button', { name: 'Start workout' }).click();
    await logExercise(page, 'bench', 'Barbell Bench Press', [
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
    ]);
    const bench = exerciseCard(page, 'Barbell Bench Press');
    const weight = bench.getByRole('spinbutton', { name: 'Weight in kg, set 1', exact: true });
    const weightBox = await weight.boundingBox();
    expect(weightBox?.width).toBeGreaterThanOrEqual(44);
    expect(weightBox?.height).toBeGreaterThanOrEqual(44);
    await weight.fill('102.5');
    await expect(weight).toHaveValue('102.5');
    const nearFail = setRow(bench, 1).getByRole('radio', { name: 'Near fail', exact: true });
    await expect(nearFail).toHaveText('Near fail');
    await expect(nearFail.getByText('Near fail', { exact: true })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const clipped = await page
      .locator('.workout-header, .workout-header *, .set-row, .set-row *')
      .evaluateAll((elements) =>
        elements
          .filter(
            (element) =>
              element.scrollWidth > element.clientWidth + 1 ||
              element.getBoundingClientRect().right > window.innerWidth,
          )
          .map((element) => `${element.className}: ${element.textContent?.trim()}`),
      );
    expect(clipped).toEqual([]);
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

test('the skills screen shows pixel art for the ten skills', async ({ page }) => {
  await register(page, uniqueUsername('a11y_sk'));
  await openTab(page, 'Skills');
  const chest = skillCard(page, 'Chest');
  const skills = skillLevels(page);
  await expect(skills.getByRole('listitem')).toHaveCount(10);
  await expect(skills.locator('li svg')).toHaveCount(10);
  await expect(skills.locator('.monogram')).toHaveCount(0);
  await expect(chest).toHaveAttribute('href', '/skills/chest');
  await chest.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Chest', exact: true })).toBeVisible();
  await expect(page.getByRole('main').locator('.skill-icon svg')).toHaveCount(1);
});
