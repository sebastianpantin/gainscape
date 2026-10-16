import { expect, test } from './support/fixtures.ts';
import { addExercise, openLatestWorkout, openTab, register, setRow, uniqueUsername, xpValue } from './support/app.ts';

test('log a farmers carry to failure, earn Grip and lengthen it from history', async ({ page }) => {
  await register(page, uniqueUsername('hold'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const carry = await addExercise(page, 'farmers', 'Farmers Carry');
  const first = setRow(carry, 1);
  await first.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ }).fill('32');
  await first.getByRole('spinbutton', { name: 'Metres, set 1', exact: true }).fill('40');
  await first.getByRole('radio', { name: 'Failure', exact: true }).click();
  await expect(first.getByText(/^~[\d,]+$/)).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();

  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'XP gained' })).toContainText(/Grip: \+[\d,]+ XP/);

  await openTab(page, 'Collection');
  const holdRecords = page.getByRole('region', { name: 'Hold records' });
  await expect(holdRecords).toContainText('Farmers Carry');
  await expect(holdRecords).toContainText('Farthest 40 m');

  await openLatestWorkout(page);
  const sessionXp = page.getByRole('status', { name: 'Workout XP' });
  const xpBefore = xpValue(await sessionXp.textContent());
  const stored = setRow(page, 1);
  await expect(stored.getByRole('spinbutton', { name: 'Metres, set 1', exact: true })).toHaveValue('40');
  await stored.getByRole('radio', { name: 'Hard', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect.poll(async () => xpValue(await sessionXp.textContent())).toBeLessThan(xpBefore);
});

test('time a dead hang and a plate pinch in seconds, then see the record chip when the hang lasts longer', async ({
  page,
}) => {
  await register(page, uniqueUsername('hang'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  const hang = setRow(await addExercise(page, 'dead hang', 'Dead Hang'), 1);
  await hang.getByRole('spinbutton', { name: 'Seconds, set 1', exact: true }).fill('30');
  await hang.getByRole('radio', { name: 'Hard', exact: true }).click();
  const pinch = setRow(await addExercise(page, 'plate pinch', 'Plate Pinch'), 1);
  await pinch.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ }).fill('20');
  await pinch.getByRole('spinbutton', { name: 'Seconds, set 1', exact: true }).fill('25');
  await pinch.getByRole('radio', { name: 'Hard', exact: true }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByLabel('Bodyweight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save and finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();

  await openTab(page, 'Collection');
  const holdRecords = page.getByRole('region', { name: 'Hold records' });
  await expect(holdRecords).toContainText('Dead Hang');
  await expect(holdRecords).toContainText('Longest 30 s');

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  const longerHang = setRow(await addExercise(page, 'dead hang', 'Dead Hang'), 1);
  const recordChip = longerHang.getByRole('img', { name: 'Predicted longest hold: 45 s' });
  await longerHang.getByRole('spinbutton', { name: 'Seconds, set 1', exact: true }).fill('25');
  await longerHang.getByRole('radio', { name: 'Hard', exact: true }).click();
  await expect(longerHang.getByRole('img', { name: /^Predicted longest hold/ })).toHaveCount(0);
  await longerHang.getByRole('spinbutton', { name: 'Seconds, set 1', exact: true }).fill('45');
  await longerHang.getByRole('radio', { name: 'Failure', exact: true }).click();
  await expect(recordChip).toHaveText('Longest hold!');
});
