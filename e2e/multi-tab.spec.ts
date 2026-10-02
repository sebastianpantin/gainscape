import { expect, type Page, test } from '@playwright/test';
import { finishWorkout, logExercise, muteDraftBroadcasts, register, uniqueUsername } from './support/app.ts';
import { sessionCount } from './support/db.ts';

function benchHeading(page: Page) {
  return page.getByRole('heading', { name: 'Barbell Bench Press', exact: true });
}

test('an edit in one tab shows up in the other without a reload', async ({ context, page }) => {
  await register(page, uniqueUsername('mt_a'));
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('button', { name: 'Start workout' })).toBeVisible();

  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await expect(benchHeading(second)).toBeVisible();
  await expect(second.locator('li.set-row').first().getByLabel('reps')).toHaveValue('5');
});

test('Finish in one tab sends exactly one request and the other tab follows', async ({ context, page }) => {
  const username = uniqueUsername('mt_b');
  await register(page, username);
  const second = await context.newPage();
  await second.goto('/');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await expect(benchHeading(second)).toBeVisible();

  const completeSessionRequests: string[] = [];
  context.on('request', (request) => {
    if (request.url().includes('/functions/v1/complete-session')) completeSessionRequests.push(request.method());
  });
  let releaseRequest: () => void = () => {};
  const requestReleased = new Promise<void>((resolve) => (releaseRequest = resolve));
  await page.route('**/functions/v1/complete-session', async (route) => {
    await requestReleased;
    await route.continue();
  });

  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(second.getByRole('heading', { name: 'Saving workout…' })).toBeVisible();
  releaseRequest();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect(second.getByText('This workout was saved in another tab.')).toBeVisible();
  expect(completeSessionRequests).toEqual(['POST']);
  expect(await sessionCount(username)).toBe(1);
});

test('a stale edit after the other tab synced does not resurrect the draft', async ({ context, page }) => {
  const username = uniqueUsername('mt_c');
  await register(page, username);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);

  const second = await context.newPage();
  await muteDraftBroadcasts(second);
  await second.goto('/');
  await expect(benchHeading(second)).toBeVisible();

  await finishWorkout(page);
  await expect(benchHeading(second)).toBeVisible();

  await second.locator('li.set-row').first().getByLabel('reps').fill('7');
  await expect(second.getByText('This workout was saved in another tab.')).toBeVisible();
  await second.reload();
  await expect(second.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(benchHeading(second)).toHaveCount(0);
  expect(await sessionCount(username)).toBe(1);
});
