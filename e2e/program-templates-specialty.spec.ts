import { expect, test } from './support/fixtures.ts';
import { register, uniqueUsername } from './support/app.ts';
import {
  bindExercise,
  dayPicker,
  fillProgramInputs,
  followProgram,
  openEnrollForm,
  prescribedRows,
  programToday,
  startFollowing,
} from './support/program-enrollment.ts';

const SMOLOV_JR = 'Smolov Jr';
const RPE = 'RPE top set with back-offs';

test('Smolov Jr: week 1 at a 1RM of 100 kg is 6×6 @ 70, 7×5 @ 75, 8×4 @ 80 and 10×3 @ 85 kg', async ({ page }) => {
  await register(page, uniqueUsername('pt_smj'));
  await openEnrollForm(page, SMOLOV_JR);
  await fillProgramInputs(page, { 'Main lift 1RM (kg)': 100 });
  await bindExercise(page, 'Main lift', 'Back Squat');
  await startFollowing(page, SMOLOV_JR);

  const today = programToday(page, SMOLOV_JR);
  const days = dayPicker(today);
  await expect(days.getByRole('radio', { name: 'C1 W1 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(['6 × 6 @ 70 kg · 70%']);

  await days.getByRole('radio', { name: 'C1 W1 Day 2', exact: true }).click();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(['7 × 5 @ 75 kg · 75%']);

  await days.getByRole('radio', { name: 'C1 W1 Day 3', exact: true }).click();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(['8 × 4 @ 80 kg · 80%']);

  await days.getByRole('radio', { name: 'C1 W1 Day 4', exact: true }).click();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(['10 × 3 @ 85 kg · 85%']);
  await expect(today.getByRole('button', { name: `Start: ${SMOLOV_JR} — C1 W1 Day 4`, exact: true })).toBeVisible();
});

test('RPE: the squat day is a top set 3 @ RPE 8 (200 × 0.863 = 172.6 → 172.5) and five optional back-offs at 95% (163.875 → 165)', async ({
  page,
}) => {
  await register(page, uniqueUsername('pt_rpe'));
  await followProgram(page, RPE, {
    'Squat estimated 1RM (kg)': 200,
    'Bench press estimated 1RM (kg)': 120,
    'Deadlift estimated 1RM (kg)': 240,
  });

  const today = programToday(page, RPE);
  await expect(dayPicker(today).getByRole('radio', { name: 'W1 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(['172.5 kg × 3 · 86.3%']);
  await expect(prescribedRows(today, 'Back Squat — supplemental')).toHaveText(['5 × 3 @ 165 kg · 95% · optional']);
  await expect(today.getByRole('button', { name: `Start: ${RPE} — W1 Day 1`, exact: true })).toBeVisible();
});
