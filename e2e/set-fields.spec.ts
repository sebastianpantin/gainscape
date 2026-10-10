import { expect, test } from './support/fixtures.ts';
import { addExercise, register, setRow, uniqueUsername } from './support/app.ts';

const BENCH = 'Barbell Bench Press';

test('weight and reps can be cleared and retyped, with a comma as the decimal separator', async ({ page }) => {
  await register(page, uniqueUsername('fields'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const row = setRow(await addExercise(page, 'bench', BENCH), 1);
  const weight = row.getByRole('spinbutton', { name: 'kg', exact: true });
  const reps = row.getByRole('spinbutton', { name: 'reps', exact: true });

  await weight.fill('60');
  await weight.press('Control+A');
  await weight.press('Backspace');
  await expect(weight).toHaveValue('');
  await weight.pressSequentially('62,5');
  await expect(weight).toHaveValue('62,5');

  await reps.fill('8');
  await reps.press('Control+A');
  await reps.press('Backspace');
  await expect(reps).toHaveValue('');
  await reps.pressSequentially('10');
  await expect(reps).toHaveValue('10');

  await row.getByRole('button', { name: 'Done set 1' }).click();
  await expect(weight).toHaveValue('62.5');
  await expect(reps).toHaveValue('10');

  await page.getByRole('button', { name: 'Heavier, set 1' }).click();
  await expect(weight).toHaveValue('65');

  await reps.fill('');
  await row.getByRole('button', { name: 'One more rep, set 1' }).click();
  await expect(reps).toHaveValue('11');

  await page.reload();
  await expect(weight).toHaveValue('65');
  await expect(reps).toHaveValue('11');
});

test('a field flags text that is not the saved value and steps with the arrow keys', async ({ page }) => {
  await register(page, uniqueUsername('fields'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const row = setRow(await addExercise(page, 'bench', BENCH), 1);
  const weight = row.getByRole('spinbutton', { name: 'kg', exact: true });
  const reps = row.getByRole('spinbutton', { name: 'reps', exact: true });

  await weight.fill('60');
  await expect(weight).not.toHaveAttribute('aria-invalid');
  await weight.fill('');
  await expect(weight).toHaveAttribute('aria-invalid', 'true');
  await expect(weight).toHaveAccessibleDescription('Saved as 60');
  await weight.press('ArrowUp');
  await expect(weight).toHaveValue('62.5');
  await expect(weight).not.toHaveAttribute('aria-invalid');
  await weight.press('ArrowDown');
  await weight.press('ArrowDown');
  await expect(weight).toHaveValue('57.5');

  await reps.fill('0');
  await expect(reps).toHaveAttribute('aria-invalid', 'true');
  await expect(reps).toHaveAccessibleDescription('Saved as 1');
  await reps.blur();
  await expect(reps).toHaveValue('1');
  await expect(reps).not.toHaveAttribute('aria-invalid');
  await reps.press('ArrowDown');
  await expect(reps).toHaveValue('1');
  await reps.press('ArrowUp');
  await expect(reps).toHaveValue('2');
});
