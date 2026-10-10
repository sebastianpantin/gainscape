import { expect, test } from './support/fixtures.ts';
import { register, uniqueUsername } from './support/app.ts';
import {
  dayPicker,
  fillProgramInputs,
  openEnrollForm,
  prescribedRows,
  programToday,
  repeated,
  repsIn,
  startFollowing,
  weightsIn,
  workoutCards,
} from './support/program-enrollment.ts';

const JUGGERNAUT = 'Juggernaut Method 2.0 (structure)';

const JUGGERNAUT_TMS_KG: Readonly<Record<string, number>> = {
  'Squat training max (kg)': 100,
  'Bench press training max (kg)': 80,
  'Deadlift training max (kg)': 140,
  'Overhead press training max (kg)': 50,
};

test('enroll in Juggernaut in kg and see the 10s accumulation as 5×10 at 60% of the TM 100 (60 kg) with the last set "10+"', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await register(page, uniqueUsername('pt_jug'));
  await openEnrollForm(page, JUGGERNAUT);
  await fillProgramInputs(page, JUGGERNAUT_TMS_KG);
  await startFollowing(page, JUGGERNAUT);

  const today = programToday(page, JUGGERNAUT);
  await expect(dayPicker(today).getByRole('radio', { name: 'C1 W1 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText([
    ...repeated('60 kg × 10 · 60%', 4),
    '60 kg × 10+ · 60%',
  ]);

  await today.getByRole('button', { name: `Start: ${JUGGERNAUT} — C1 W1 Day 1`, exact: true }).click();
  await expect(page.getByText(`${JUGGERNAUT} — C1 W1 Day 1`, { exact: true })).toBeVisible();
  const squat = workoutCards(page, 'Back Squat');
  expect(await weightsIn(squat)).toEqual(['60', '60', '60', '60', '60']);
  expect(await repsIn(squat)).toEqual(['10', '10', '10', '10', '10']);
  const sets = squat.getByRole('listitem');
  await expect(sets.nth(4).getByText('10+', { exact: true })).toBeVisible();
  await expect(sets.nth(0).getByText('10+', { exact: true })).toHaveCount(0);
});

test('a kg Juggernaut enrollment is not offered the lb-only fine per-rep increment, an lb one is', async ({ page }) => {
  await register(page, uniqueUsername('pt_jfine'));
  await openEnrollForm(page, JUGGERNAUT);
  const options = page.getByRole('region', { name: 'Options', exact: true });
  const unit = page.getByRole('radiogroup', { name: 'Unit', exact: true });
  await expect(unit.getByRole('radio', { name: 'kg', exact: true })).toBeChecked();
  await expect(options.getByRole('radio', { name: /standard/i })).toBeVisible();
  await expect(options.getByRole('radio', { name: /fine/i })).toHaveCount(0);

  await unit.getByRole('radio', { name: 'lb', exact: true }).click();
  await expect(options.getByRole('radio', { name: /fine/i })).toBeVisible();

  await unit.getByRole('radio', { name: 'kg', exact: true }).click();
  await expect(options.getByRole('radio', { name: /fine/i })).toHaveCount(0);
});

test('switching an lb Juggernaut enrollment with the fine increment to kg falls back to standard', async ({ page }) => {
  await register(page, uniqueUsername('pt_jrs'));
  await openEnrollForm(page, JUGGERNAUT);
  const options = page.getByRole('region', { name: 'Options', exact: true });
  const unit = page.getByRole('radiogroup', { name: 'Unit', exact: true });
  await unit.getByRole('radio', { name: 'lb', exact: true }).click();
  await options.getByRole('radio', { name: /fine/i }).click();
  await expect(options.getByRole('radio', { name: /fine/i })).toBeChecked();

  await unit.getByRole('radio', { name: 'kg', exact: true }).click();
  await expect(options.getByRole('radio', { name: /standard/i })).toBeChecked();

  await unit.getByRole('radio', { name: 'lb', exact: true }).click();
  await expect(options.getByRole('radio', { name: /standard/i })).toBeChecked();
});
