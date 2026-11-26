import { expect, test } from './support/fixtures.ts';
import {
  addExercise,
  finishWorkout,
  openLatestWorkout,
  openSetOptions,
  register,
  setRow,
  uniqueUsername,
} from './support/app.ts';

const CURL = 'Eccentric Wrist Curl';

test('a rehab set logs pain while training, and History shows and changes it', async ({ page }) => {
  await register(page, uniqueUsername('pain_log'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const card = await addExercise(page, 'eccentric wrist', CURL);
  const row = setRow(card, 1);
  const pain = row.getByRole('spinbutton', { name: 'Pain from 0 to 10, set 1', exact: true });
  await expect(pain).toHaveCount(0);

  await row.getByRole('spinbutton', { name: /weight in kg, set 1$/i }).fill('6');
  await row.getByRole('spinbutton', { name: 'Reps, set 1', exact: true }).fill('15');
  await openSetOptions(row, 1);
  await row.getByRole('button', { name: 'Log pain, set 1', exact: true }).click();
  await pain.fill('3');
  await pain.blur();
  await row.getByRole('button', { name: 'Done set 1', exact: true }).click();
  await finishWorkout(page);

  await openLatestWorkout(page);
  const saved = setRow(page, 1).getByRole('spinbutton', { name: 'Pain from 0 to 10, set 1', exact: true });
  await expect(saved).toHaveValue('3');
  await saved.fill('1');
  await saved.blur();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await page.reload();
  await expect(saved).toHaveValue('1');

  await setRow(page, 1).getByRole('button', { name: 'Clear pain, set 1', exact: true }).click();
  await expect(saved).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await page.reload();
  await expect(setRow(page, 1).getByRole('button', { name: 'Log pain, set 1', exact: true })).toBeVisible();
});
