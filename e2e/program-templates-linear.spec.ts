import { expect, test } from '@playwright/test';
import { finishWorkout, register, uniqueUsername } from './support/app.ts';
import { exerciseIdOfKey } from './support/db.ts';
import {
  bindExercise,
  dayPicker,
  followProgram,
  markEverySetDone,
  openEnrollForm,
  fillProgramInputs,
  prescribedRows,
  programToday,
  repeated,
  startFollowing,
  weightsIn,
  workoutCards,
} from './support/program-enrollment.ts';

const STRONGLIFTS = 'StrongLifts 5x5';
const STARTING_STRENGTH = 'Starting Strength';
const GZCLP = 'GZCLP';
const NSUNS = 'nSuns LP 5-day';
const TEXAS = 'Texas Method';

test('StrongLifts: Workout A is 5×5 at the working weights, and finishing it suggests Workout B with the squat up 2.5 kg (60 + 2.5 = 62.5)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await register(page, uniqueUsername('pt_sl'));
  await followProgram(page, STRONGLIFTS, {
    'Squat working weight (kg)': 60,
    'Bench press working weight (kg)': 40,
    'Barbell row working weight (kg)': 40,
    'Overhead press working weight (kg)': 30,
    'Deadlift working weight (kg)': 80,
  });

  const today = programToday(page, STRONGLIFTS);
  await expect(dayPicker(today).getByRole('radio', { name: 'Session 1 Workout A', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(repeated('60 kg × 5 · 100%', 5));
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText(repeated('40 kg × 5 · 100%', 5));
  await expect(prescribedRows(today, 'Barbell Row')).toHaveText(repeated('40 kg × 5 · 100%', 5));

  await today.getByRole('button', { name: `Start: ${STRONGLIFTS} — Session 1 Workout A`, exact: true }).click();
  await expect(page.getByText(`${STRONGLIFTS} — Session 1 Workout A`, { exact: true })).toBeVisible();
  expect(await weightsIn(workoutCards(page, 'Back Squat'))).toEqual(['60', '60', '60', '60', '60']);
  await markEverySetDone(page);
  await finishWorkout(page);
  await page.getByRole('link', { name: 'Done' }).click();

  const after = programToday(page, STRONGLIFTS);
  await expect(dayPicker(after).getByRole('radio', { name: 'Session 2 Workout B', exact: true })).toBeChecked();
  await expect(
    after.getByRole('button', { name: `Start: ${STRONGLIFTS} — Session 2 Workout B`, exact: true }),
  ).toBeVisible();
  await expect(prescribedRows(after, 'Back Squat')).toHaveText(repeated('62.5 kg × 5 · 100%', 5));
  await expect(prescribedRows(after, 'Overhead Press')).toHaveText(repeated('30 kg × 5 · 100%', 5));
  await expect(prescribedRows(after, 'Deadlift')).toHaveText(['80 kg × 5 · 100%']);
});

test('Starting Strength: Workout A is squat 3×5, bench 3×5 and deadlift 1×5 at the working weights', async ({
  page,
}) => {
  await register(page, uniqueUsername('pt_ss'));
  await followProgram(page, STARTING_STRENGTH, {
    'Squat working weight (kg)': 60,
    'Bench press working weight (kg)': 50,
    'Press working weight (kg)': 35,
    'Deadlift working weight (kg)': 80,
  });

  const today = programToday(page, STARTING_STRENGTH);
  await expect(dayPicker(today).getByRole('radio', { name: 'Session 1 Workout A', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(repeated('60 kg × 5 · 100%', 3));
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText(repeated('50 kg × 5 · 100%', 3));
  await expect(prescribedRows(today, 'Deadlift')).toHaveText(['80 kg × 5 · 100%']);
  await expect(
    today.getByRole('button', { name: `Start: ${STARTING_STRENGTH} — Session 1 Workout A`, exact: true }),
  ).toBeVisible();
});

test('GZCLP: A1 is the T1 squat 5×3 with the last set "3+", the T2 bench 3×10 and the T3 pulldown 3×15 with the last set "15+"', async ({
  page,
}) => {
  await register(page, uniqueUsername('pt_gz'));
  await openEnrollForm(page, GZCLP);
  await fillProgramInputs(page, {
    'Squat T1 working weight (kg)': 100,
    'Bench press T1 working weight (kg)': 60,
    'Overhead press T1 working weight (kg)': 40,
    'Deadlift T1 working weight (kg)': 120,
    'Squat T2 working weight (kg)': 70,
    'Bench press T2 working weight (kg)': 50,
    'Overhead press T2 working weight (kg)': 30,
    'Deadlift T2 working weight (kg)': 90,
    'Lat pulldown T3 working weight (kg)': 40,
    'Dumbbell row T3 working weight (kg)': 20,
  });
  await bindExercise(page, 'Squat T1', 'Back Squat');
  await bindExercise(page, 'Bench press T2', 'Barbell Bench Press');
  await bindExercise(page, 'Lat pulldown T3', 'Lat Pulldown');
  await startFollowing(page, GZCLP);

  const today = programToday(page, GZCLP);
  await expect(dayPicker(today).getByRole('radio', { name: 'Session 1 A1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText([
    ...repeated('100 kg × 3 · 100%', 4),
    '100 kg × 3+ · 100%',
  ]);
  await expect(prescribedRows(today, 'Barbell Bench Press — supplemental')).toHaveText(
    repeated('50 kg × 10 · 100%', 3),
  );
  await expect(prescribedRows(today, 'Lat Pulldown — assistance')).toHaveText([
    ...repeated('40 kg × 15 · 100%', 2),
    '40 kg × 15+ · 100%',
  ]);
});

test('nSuns 5-day: Monday is the T1 bench 9-set list at TM 100 ending "8+", and Tuesday the T1 squat at TM 140 with the 1+ set at 95% (133 → 132.5)', async ({
  page,
}) => {
  await register(page, uniqueUsername('pt_ns'));
  await followProgram(page, NSUNS, {
    'Bench press training max (kg)': 100,
    'Squat training max (kg)': 140,
    'Overhead press training max (kg)': 60,
    'Deadlift training max (kg)': 200,
  });

  const today = programToday(page, NSUNS);
  const days = dayPicker(today);
  await expect(days.getByRole('radio', { name: 'W1 Monday', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText([
    '65 kg × 8 · 65%',
    '75 kg × 6 · 75%',
    '85 kg × 4 · 85%',
    '85 kg × 4 · 85%',
    '85 kg × 4 · 85%',
    '80 kg × 5 · 80%',
    '75 kg × 6 · 75%',
    '70 kg × 7 · 70%',
    '65 kg × 8+ · 65%',
  ]);
  await expect(prescribedRows(today, 'Overhead Press — supplemental')).toHaveText([
    '30 kg × 6 · 50%',
    '35 kg × 5 · 60%',
    '42.5 kg × 3 · 70%',
    '42.5 kg × 5 · 70%',
    '42.5 kg × 7 · 70%',
    '42.5 kg × 4 · 70%',
    '42.5 kg × 6 · 70%',
    '42.5 kg × 8 · 70%',
  ]);

  await days.getByRole('radio', { name: 'W1 Tuesday', exact: true }).click();
  await expect(today.getByRole('button', { name: `Start: ${NSUNS} — W1 Tuesday`, exact: true })).toBeVisible();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText([
    '105 kg × 5 · 75%',
    '120 kg × 3 · 85%',
    '132.5 kg × 1+ · 95%',
    '125 kg × 3 · 90%',
    '120 kg × 3 · 85%',
    '112.5 kg × 3 · 80%',
    '105 kg × 5 · 75%',
    '97.5 kg × 5 · 70%',
    '90 kg × 5+ · 65%',
  ]);
});

test('Texas Method: the volume day is squat and bench press 5×5 at 90% of the 5RM (150 → 135, 100 → 90) and deadlift 1×5', async ({
  page,
}) => {
  await register(page, uniqueUsername('pt_tx'));
  await followProgram(page, TEXAS, {
    'Squat 5RM (kg)': 150,
    'Bench press or overhead press 5RM (kg)': 100,
    'Deadlift working weight (kg)': 180,
  });

  const today = programToday(page, TEXAS);
  await expect(dayPicker(today).getByRole('radio', { name: 'W1 Volume day', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(repeated('135 kg × 5 · 90%', 5));
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText(repeated('90 kg × 5 · 90%', 5));
  await expect(prescribedRows(today, 'Deadlift')).toHaveText(['180 kg × 5 · 100%']);
  await expect(today.getByRole('button', { name: `Start: ${TEXAS} — W1 Volume day`, exact: true })).toBeVisible();
});

test('Texas Method: the press exercise follows the press option until the user picks one', async ({ page }) => {
  await register(page, uniqueUsername('pt_txp'));
  await openEnrollForm(page, TEXAS);
  const pressExercise = page.getByLabel('Bench press or overhead press exercise', { exact: true });
  const options = page.getByRole('region', { name: 'Options', exact: true });
  await expect(pressExercise).toHaveValue(await exerciseIdOfKey('barbell_bench_press'));

  await options.getByRole('radio', { name: /ohp|overhead/i }).click();
  await expect(pressExercise).toHaveValue(await exerciseIdOfKey('overhead_press'));

  await pressExercise.selectOption({ label: 'Incline Barbell Bench Press' });
  await options.getByRole('radio', { name: /bench/i }).click();
  await expect(pressExercise).toHaveValue(await exerciseIdOfKey('incline_barbell_bench_press'));
});
