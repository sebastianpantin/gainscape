import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { expectNoAxeViolations } from './support/a11y.ts';
import { addExercise, finishWorkout, logExercise, register, uniqueUsername } from './support/app.ts';
import { workoutCards } from './support/program-enrollment.ts';

const BENCH = 'Barbell Bench Press';
const OFFLINE_TEXT = 'Notes can be edited when you are online.';

async function writeNote(page: Page, name: string, text: string) {
  const card = workoutCards(page, name);
  await card.getByRole('button', { name: new RegExp(`^(Add|Edit) note for ${name}$`) }).click();
  await card.getByRole('textbox', { name: `Note for ${name}` }).fill(text);
  await card.getByRole('button', { name: 'Save note' }).click();
  await expect(card.getByRole('textbox', { name: `Note for ${name}` })).toHaveCount(0);
}

test('an exercise note sticks to the exercise across workouts and is edited inline', async ({ page }) => {
  await register(page, uniqueUsername('note'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', BENCH, [{ weightKg: 60, reps: 5 }]);
  const card = workoutCards(page, BENCH);

  await writeNote(page, BENCH, 'Seat 4\nWide grip');
  await expect(card.getByText('Seat 4 Wide grip')).toBeVisible();
  await expect(card.getByRole('button', { name: `Edit note for ${BENCH}` })).toBeVisible();
  await expectNoAxeViolations(page, 'exercise note');
  await finishWorkout(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addExercise(page, 'bench', BENCH);
  await expect(card.getByText('Seat 4 Wide grip')).toBeVisible();

  await card.getByRole('button', { name: `Edit note for ${BENCH}` }).click();
  const field = card.getByRole('textbox', { name: `Note for ${BENCH}` });
  await expect(field).toHaveValue('Seat 4\nWide grip');
  await expectNoAxeViolations(page, 'exercise note editor');
  await field.fill('Seat 5');
  await card.getByRole('button', { name: 'Cancel' }).click();
  await expect(card.getByText('Seat 4 Wide grip')).toBeVisible();

  await writeNote(page, BENCH, 'Seat 5');
  await expect(card.getByText('Seat 5', { exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByText('Seat 5', { exact: true })).toBeVisible();

  await writeNote(page, BENCH, '   ');
  await expect(card.getByRole('button', { name: `Add note for ${BENCH}` })).toBeVisible();
  await expect(card.getByText('Seat 5', { exact: true })).toBeHidden();
  await page.reload();
  await expect(card.getByRole('button', { name: `Add note for ${BENCH}` })).toBeVisible();
});

test('a saved note shows from the device cache when the server cannot be reached, and editing waits for a connection', async ({
  page,
  context,
}) => {
  await register(page, uniqueUsername('note_off'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addExercise(page, 'bench', BENCH);
  const card = workoutCards(page, BENCH);
  await writeNote(page, BENCH, 'Seat 4');
  await expect(card.getByText('Seat 4', { exact: true })).toBeVisible();

  await page.route('**/rest/v1/exercise_notes*', (route) => route.abort('failed'));
  await page.reload();
  await expect(card.getByText('Seat 4', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(card.getByRole('button', { name: `Edit note for ${BENCH}` })).toBeDisabled();
  await expect(card.getByText(OFFLINE_TEXT)).toBeVisible();
  await context.setOffline(false);
  await expect(card.getByRole('button', { name: `Edit note for ${BENCH}` })).toBeEnabled();
  await expect(card.getByText(OFFLINE_TEXT)).toBeHidden();
});

test('a slow notes fetch that started before a save does not undo the save', async ({ page }) => {
  await register(page, uniqueUsername('note_rc'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addExercise(page, 'bench', BENCH);
  const card = workoutCards(page, BENCH);
  await writeNote(page, BENCH, 'Seat 4');
  await expect(card.getByText('Seat 4', { exact: true })).toBeVisible();

  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let answered: () => void = () => undefined;
  const staleAnswered = new Promise<void>((resolve) => {
    answered = resolve;
  });
  await page.route('**/rest/v1/exercise_notes*', async (route) => {
    const stale = await route.fetch();
    await released;
    await route.fulfill({ response: stale });
    answered();
  });
  await page.reload();
  await expect(card.getByText('Seat 4', { exact: true })).toBeVisible();
  await writeNote(page, BENCH, 'Seat 5');
  await expect(card.getByText('Seat 5', { exact: true })).toBeVisible();

  const cacheSavedAt = () =>
    page.evaluate(() => {
      const key = Object.keys(localStorage).find((name) => name.startsWith('gainscape.exercise-notes.v1.'));
      return key ? (JSON.parse(localStorage.getItem(key)!).savedAt as string) : null;
    });
  const savedAtBeforeRelease = await cacheSavedAt();
  release();
  await staleAnswered;
  await expect.poll(cacheSavedAt).not.toBe(savedAtBeforeRelease);
  await expect(card.getByText('Seat 5', { exact: true })).toBeVisible();
  await page.unroute('**/rest/v1/exercise_notes*');
  await page.reload();
  await expect(card.getByText('Seat 5', { exact: true })).toBeVisible();
});

test('a note that fails to save keeps the text and says why', async ({ page }) => {
  await register(page, uniqueUsername('note_err'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addExercise(page, 'bench', BENCH);
  const card = workoutCards(page, BENCH);
  await page.route('**/rest/v1/rpc/save_exercise_note', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PT429', message: 'rate_limited', details: '{"retryAfterSeconds": 600}' }),
    }),
  );
  await card.getByRole('button', { name: `Add note for ${BENCH}` }).click();
  await card.getByRole('textbox', { name: `Note for ${BENCH}` }).fill('Seat 4');
  await card.getByRole('button', { name: 'Save note' }).click();
  await expect(card.getByRole('alert')).toHaveText('Too many changes in a short time. Try again in 10 min.');
  await expect(card.getByRole('textbox', { name: `Note for ${BENCH}` })).toHaveValue('Seat 4');
});
