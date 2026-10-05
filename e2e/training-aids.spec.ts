import { expect, type Page, test } from '@playwright/test';
import {
  finishWorkout,
  logExercise,
  logWorkout,
  openFromProfile,
  openTab,
  register,
  uniqueUsername,
} from './support/app.ts';

declare global {
  interface Window {
    deviceCalls: string[];
  }
}

async function recordDeviceCalls(page: Page) {
  await page.addInitScript(() => {
    window.deviceCalls = [];
    const record = (call: string) => window.deviceCalls.push(call);
    navigator.vibrate = () => {
      record('vibrate');
      return true;
    };
    const audioNode = { connect: (next: unknown) => next ?? audioNode, frequency: {}, gain: {} };
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class {
        state = 'running';
        currentTime = 0;
        destination = audioNode;
        createGain() {
          return audioNode;
        }
        createOscillator() {
          record('beep');
          return { ...audioNode, start: () => undefined, stop: () => undefined };
        }
        resume() {
          return Promise.resolve();
        }
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: () => {
          record('lock');
          return Promise.resolve({
            addEventListener: () => undefined,
            release: () => Promise.resolve(record('release')),
          });
        },
      },
    });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: Object.assign(
        function recordNotification(title: string) {
          record(`notify:${title}`);
        },
        { permission: 'granted', requestPermission: () => Promise.resolve('granted') },
      ),
    });
  });
}

function deviceCalls(page: Page) {
  return page.evaluate(() => window.deviceCalls);
}

async function pickDeviceSetting(page: Page, setting: string, choice: 'On' | 'Off') {
  await page.getByRole('radiogroup', { name: setting }).getByRole('radio', { name: choice }).click();
}

function exerciseCard(page: Page, name: string) {
  return page.locator('section', { has: page.getByRole('heading', { name, exact: true }) });
}

test('an exercise shows last session and starts from its first set', async ({ page }) => {
  await register(page, uniqueUsername('lt'));
  await logWorkout(page, () =>
    logExercise(page, 'bench', 'Barbell Bench Press', [
      { weightKg: 60, reps: 5 },
      { weightKg: 62.5, reps: 4 },
    ]),
  );

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('bench');
  await page.getByRole('button', { name: /^Barbell Bench Press\b/ }).click();
  const bench = exerciseCard(page, 'Barbell Bench Press');
  await expect(bench.getByText('Last: 1×5 @ 60 kg, 1×4 @ 62.5 kg')).toBeVisible();
  const firstSet = bench.locator('li.set-row').first();
  await expect(firstSet.getByLabel('kg', { exact: true })).toHaveValue('60');
  await expect(firstSet.getByLabel('reps', { exact: true })).toHaveValue('5');

  await page.getByLabel('Search exercises').fill('squat');
  await page.getByRole('button', { name: /^Back Squat\b/ }).click();
  const squat = exerciseCard(page, 'Back Squat');
  await expect(squat.locator('li.set-row').first().getByLabel('kg', { exact: true })).toHaveValue('20');
  await expect(squat.getByText(/^Last:/)).toHaveCount(0);
});

test('a lift suggests the next weight from how its last session went', async ({ page }) => {
  await register(page, uniqueUsername('nw'));
  const threeSetsOf = (weightKg: number, reps: number) => [
    { weightKg, reps },
    { weightKg, reps },
    { weightKg, reps },
  ];
  await logWorkout(page, async () => {
    await logExercise(page, 'bench', 'Barbell Bench Press', threeSetsOf(80, 5));
    await logExercise(page, 'squat', 'Back Squat', [...threeSetsOf(100, 5).slice(0, 2), { weightKg: 100, reps: 3 }]);
  });

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('bench');
  await page.getByRole('button', { name: /^Barbell Bench Press\b/ }).click();
  await expect(
    exerciseCard(page, 'Barbell Bench Press').getByText('Try 82.5 kg: every set hit 5 reps last time'),
  ).toBeVisible();
  await page.getByLabel('Search exercises').fill('squat');
  await page.getByRole('button', { name: /^Back Squat\b/ }).click();
  await expect(exerciseCard(page, 'Back Squat').getByText('Stay at 100 kg until every set hits 5 reps')).toBeVisible();
});

test('a lift that felt harder three workouts in a row suggests a lighter day', async ({ page }) => {
  await register(page, uniqueUsername('fa'));
  const bench = exerciseCard(page, 'Barbell Bench Press');
  for (const effort of ['Easy', 'Hard', 'Near fail']) {
    await openTab(page, 'Train');
    await logWorkout(page, async () => {
      await logExercise(page, 'bench', 'Barbell Bench Press', [
        { weightKg: 80, reps: 5 },
        { weightKg: 80, reps: 5 },
      ]);
      if (effort === 'Hard') return;
      for (const row of await bench.locator('li.set-row').all()) await row.getByRole('radio', { name: effort }).click();
    });
  }

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('bench');
  await page.getByRole('button', { name: /^Barbell Bench Press\b/ }).click();
  await expect(
    bench.getByText('Felt harder 3 sessions in a row at 80 kg: consider a lighter day at 72.5 kg'),
  ).toBeVisible();
  await expect(bench.getByText(/^Try /)).toHaveCount(0);
});

test('steppers change weight by a plate step and reps by one', async ({ page }) => {
  await register(page, uniqueUsername('st'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByLabel('Search exercises').fill('bench');
  await page.getByRole('button', { name: /^Barbell Bench Press\b/ }).click();
  const firstSet = exerciseCard(page, 'Barbell Bench Press').locator('li.set-row').first();
  const weight = firstSet.getByLabel('kg', { exact: true });
  const reps = firstSet.getByLabel('reps', { exact: true });

  await firstSet.getByRole('button', { name: 'Heavier, set 1' }).click();
  await firstSet.getByRole('button', { name: 'Heavier, set 1' }).click();
  await expect(weight).toHaveValue('25');
  await weight.fill('61');
  await firstSet.getByRole('button', { name: 'Lighter, set 1' }).click();
  await expect(weight).toHaveValue('60');
  await firstSet.getByRole('button', { name: 'One more rep, set 1' }).click();
  await expect(reps).toHaveValue('9');
  await firstSet.getByRole('button', { name: 'One rep fewer, set 1' }).click();
  await firstSet.getByRole('button', { name: 'One rep fewer, set 1' }).click();
  await expect(reps).toHaveValue('7');

  await page.reload();
  await expect(weight).toHaveValue('60');
  await expect(reps).toHaveValue('7');
});

test('a workout keeps the screen on and the end of a rest vibrates and beeps, as set on this device', async ({
  page,
}) => {
  await recordDeviceCalls(page);
  await page.clock.install();
  await register(page, uniqueUsername('ra'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect.poll(() => deviceCalls(page)).toEqual(['lock']);

  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await page.clock.runFor(179_000);
  expect(await deviceCalls(page)).toEqual(['lock']);
  await page.clock.runFor(2_000);
  await expect.poll(() => deviceCalls(page)).toEqual(['lock', 'vibrate', 'beep', 'beep']);

  await page.clock.resume();
  await finishWorkout(page);
  await expect.poll(() => deviceCalls(page)).toContain('release');

  await openFromProfile(page, 'Settings');
  for (const setting of ['Vibrate when rest ends', 'Sound when rest ends', 'Keep screen on during workouts'])
    await pickDeviceSetting(page, setting, 'Off');
  await page.evaluate(() => (window.deviceCalls = []));
  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await page.clock.runFor(181_000);
  await expect(page.getByRole('region', { name: 'Rest timer' }).getByRole('status')).toHaveText('Rest over');
  expect(await deviceCalls(page)).toEqual([]);
});

test('a rest that ends while the app is hidden sends a notification once allowed', async ({ page }) => {
  await recordDeviceCalls(page);
  await page.clock.install();
  await register(page, uniqueUsername('rn'));
  await openFromProfile(page, 'Settings');
  await pickDeviceSetting(page, 'Notify when rest ends in the background', 'On');
  await expect(
    page
      .getByRole('radiogroup', { name: 'Notify when rest ends in the background' })
      .getByRole('radio', { name: 'On' }),
  ).toHaveAttribute('aria-checked', 'true');

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await page.evaluate(() =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }),
  );
  await page.clock.runFor(181_000);
  await expect.poll(() => deviceCalls(page)).toContain('notify:Rest over');
});

test('turning on rest notifications explains when the browser blocks them', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'denied', requestPermission: () => Promise.resolve('denied') },
    }),
  );
  await register(page, uniqueUsername('rb'));
  await openFromProfile(page, 'Settings');
  const notify = page.getByRole('radiogroup', { name: 'Notify when rest ends in the background' });
  await notify.getByRole('radio', { name: 'On' }).click();
  await expect(page.getByRole('alert')).toContainText('blocks notifications');
  await expect(notify.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true');
});
