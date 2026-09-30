import { expect, type Page, test } from '@playwright/test';

const password = 'correct-horse-battery';

async function register(page: Page, username: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(`${username}@example.test`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
}

async function logExercise(
  page: Page,
  search: string,
  exerciseName: string,
  sets: { weightKg?: number; reps: number }[],
) {
  await page.getByLabel('Search exercises').fill(search);
  await page.getByRole('button', { name: new RegExp(`^${exerciseName}\\b`) }).click();
  const card = page.locator('section', { has: page.getByRole('heading', { name: exerciseName, exact: true }) });
  for (let index = 1; index < sets.length; index++) await card.getByRole('button', { name: '+ Add set' }).click();
  const rows = card.locator('li.set-row');
  for (const [index, set] of sets.entries()) {
    const row = rows.nth(index);
    if (set.weightKg !== undefined) await row.getByLabel(/kg/).fill(String(set.weightKg));
    await row.getByLabel('reps').fill(String(set.reps));
    await row.getByRole('radio', { name: 'Hard' }).click();
  }
}

test('bodyweight prompt, records and the collection log', async ({ page }) => {
  await register(page, `e2e_${Date.now().toString(36)}`);

  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [
    { weightKg: 60, reps: 5 },
    { weightKg: 60, reps: 5 },
  ]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 8 }, { reps: 8 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();

  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect(page.getByLabel('New records')).toHaveCount(0);

  await page.getByRole('link', { name: 'Workout' }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 70, reps: 5 }]);
  await logExercise(page, 'pull-up', 'Pull-up', [{ reps: 10 }]);
  await page.getByRole('button', { name: 'Finish workout' }).click();

  const records = page.getByLabel('New records');
  await expect(records).toContainText('Barbell Bench Press: 5RM 70 kg (was 60 kg)');
  await expect(records).toContainText('Pull-up: 10 reps (was 8)');

  await page.getByRole('link', { name: 'Collection' }).click();
  await expect(page.getByTestId('collection-completion')).toHaveText('18% (2/11)');
  const bench = page.locator('section', {
    has: page.getByRole('heading', { name: 'Barbell Bench Press', exact: true }),
  });
  await expect(bench.locator('.record-slot.filled')).toHaveText(['5RM 70 kg']);
  await expect(bench).toContainText('e1RM');
});
