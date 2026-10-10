import { expect, test } from './support/fixtures.ts';
import { addExercise, openLatestWorkout, openTab, register, setRow, uniqueUsername, xpValue } from './support/app.ts';

test('log a farmers carry to failure, earn Grip and lengthen it from history', async ({ page }) => {
  await register(page, uniqueUsername('hold'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const carry = await addExercise(page, 'farmers', 'Farmers Carry');
  const first = setRow(carry, 1);
  await first.getByRole('spinbutton', { name: 'kg' }).fill('32');
  await first.getByRole('spinbutton', { name: 'm', exact: true }).fill('40');
  await first.getByRole('radio', { name: 'Failure', exact: true }).click();
  await expect(first.getByText(/^~[\d,]+$/)).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();

  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'XP gained' })).toContainText(/Grip: \+[\d,]+ XP/);

  await openTab(page, 'Log');
  const holdRecords = page.getByRole('region', { name: 'Hold records' });
  await expect(holdRecords).toContainText('Farmers Carry');
  await expect(holdRecords).toContainText('Farthest 40 m');

  await openLatestWorkout(page);
  const sessionXp = page.getByRole('status', { name: 'Workout XP' });
  const xpBefore = xpValue(await sessionXp.textContent());
  const stored = setRow(page, 1);
  await expect(stored.getByRole('spinbutton', { name: 'm', exact: true })).toHaveValue('40');
  await stored.getByRole('radio', { name: 'Hard', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect.poll(async () => xpValue(await sessionXp.textContent())).toBeLessThan(xpBefore);
});
