import { expect, test } from './support/fixtures.ts';
import {
  finishWorkout,
  openFromProfile,
  openTab,
  readSession,
  readStoredDraft,
  register,
  setRow,
  uniqueUsername,
} from './support/app.ts';
import {
  activeEnrollmentOf,
  deleteProgramTemplate,
  exerciseIdOfKey,
  insertProgramTemplate,
  sessionRow,
} from './support/db.ts';
import {
  dayPicker,
  FIVE_THREE_ONE_ONE_RMS_KG,
  fillProgramInputs,
  followProgram,
  MADCOW_FIVE_RMS_KG,
  markEverySetDone,
  openEnrollForm,
  powerliftingPrograms,
  prescribedRows,
  programToday,
  repsIn,
  startFollowing,
  weightsIn,
  workoutCards,
} from './support/program-enrollment.ts';

const MADCOW_W1_MONDAY_SQUAT = [
  '47.5 kg × 5 · 50%',
  '57.5 kg × 5 · 62.5%',
  '70 kg × 5 · 75%',
  '80 kg × 5 · 87.5%',
  '92.5 kg × 5 · 100%',
];

const FIVE_THREE_ONE_W1_SQUAT_AT_TM_90 = ['57.5 kg × 5 · 65%', '67.5 kg × 5 · 75%', '77.5 kg × 5+ · 85%'];

const BBB_AT_TM_90 = ['5 × 10 @ 45 kg · 50%'];

function staleTemplateDefinition(key: string, name: string) {
  return {
    key,
    version: 1,
    name,
    source: ['e2e stale app check'],
    lifts: [{ key: 'squat', name: 'Squat', category: 'lower' }],
    inputs: [{ lifts: ['squat'], kinds: ['oneRm'] }],
    referenceVars: ['tm'],
    initial: [{ kind: 'copy', var: 'tm', from: 'oneRm' }],
    options: [],
    schedule: {
      kind: 'weekly',
      days: [
        {
          key: 'mon',
          name: 'Day 1',
          slots: [
            {
              id: 'mon-squat',
              lift: 'squat',
              role: 'main',
              scheme: { kind: 'repeat', count: 5, reps: 5, load: { kind: 'warpSpeedLoad', of: 'tm' } },
            },
          ],
        },
      ],
    },
    progression: [],
  };
}

test('enroll in Madcow in kg, start W1 Day 1 with the ramp rows, finish and see W1 Day 2 offered next', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('pe_mc');
  await register(page, username);
  const { user } = await readSession(page);

  await openEnrollForm(page, 'Madcow 5x5');
  await expect(page.getByRole('radiogroup', { name: 'Unit' }).getByRole('radio', { name: 'Kilograms' })).toBeChecked();
  await expect(
    page.getByRole('radiogroup', { name: 'Ramp step' }).getByRole('radio', { name: '12.5%', exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel('Squat exercise', { exact: true })).toHaveValue(await exerciseIdOfKey('back_squat'));
  await fillProgramInputs(page, MADCOW_FIVE_RMS_KG);
  await expect(page.getByText('Top set 92.69 kg', { exact: true })).toBeVisible();
  await startFollowing(page, 'Madcow 5x5');

  await expect
    .poll(() => activeEnrollmentOf(username))
    .toMatchObject({
      template_key: 'madcow_5x5',
      template_version: 2,
      unit: 'kg',
      options: { rampStep: 0.125 },
      inputs: {
        squat: { fiveRm: 100 },
        bench: { fiveRm: 80 },
        row: { fiveRm: 70 },
        press: { fiveRm: 50 },
        deadlift: { fiveRm: 140 },
      },
      rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    });

  const today = programToday(page, 'Madcow 5x5');
  const days = dayPicker(today);
  await expect(days.getByRole('radio')).toHaveCount(3);
  await expect(days.getByRole('radio', { name: 'W1 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(MADCOW_W1_MONDAY_SQUAT);
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText([
    '37.5 kg × 5 · 50%',
    '47.5 kg × 5 · 62.5%',
    '57.5 kg × 5 · 75%',
    '65 kg × 5 · 87.5%',
    '75 kg × 5 · 100%',
  ]);

  await today.getByRole('button', { name: 'Start: Madcow 5x5 — W1 Day 1', exact: true }).click();
  await expect(page.getByText('Madcow 5x5 — W1 Day 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
    'Back Squat',
    'Barbell Bench Press',
    'Barbell Row',
  ]);
  await expect.poll(() => weightsIn(workoutCards(page, 'Back Squat'))).toEqual(['47.5', '57.5', '70', '80', '92.5']);
  await expect.poll(() => repsIn(workoutCards(page, 'Back Squat'))).toEqual(['5', '5', '5', '5', '5']);
  await expect.poll(() => weightsIn(workoutCards(page, 'Barbell Row'))).toEqual(['32.5', '40', '50', '57.5', '65']);

  await markEverySetDone(page);
  await finishWorkout(page);
  await expect
    .poll(async () => {
      const stored = await readStoredDraft(page, user.id);
      return stored?.syncedSessionId ? await sessionRow(stored.syncedSessionId) : null;
    })
    .toMatchObject({ enrollment_id: expect.any(String), program_position: { week: 1, day: 'mon' } });

  await page.getByRole('link', { name: 'Done' }).click();
  const after = programToday(page, 'Madcow 5x5');
  await expect(dayPicker(after).getByRole('radio')).toHaveCount(2);
  await expect(dayPicker(after).getByRole('radio', { name: 'W1 Day 2', exact: true })).toBeChecked();
  await expect(dayPicker(after).getByRole('radio', { name: 'W1 Day 1', exact: true })).toHaveCount(0);
  await expect(after.getByRole('button', { name: 'Start: Madcow 5x5 — W1 Day 2', exact: true })).toBeVisible();
  await expect(prescribedRows(after, 'Back Squat')).toHaveText([
    '47.5 kg × 5 · 50%',
    '57.5 kg × 5 · 62.5%',
    '2 × 5 @ 70 kg · 75%',
  ]);

  await dayPicker(after).getByRole('radio', { name: 'W1 Day 3', exact: true }).click();
  await expect(after.getByRole('button', { name: 'Start: Madcow 5x5 — W1 Day 3', exact: true })).toBeVisible();
  await expect(prescribedRows(after, 'Back Squat')).toHaveText([
    '47.5 kg × 5 · 50%',
    '57.5 kg × 5 · 62.5%',
    '70 kg × 5 · 75%',
    '80 kg × 5 · 87.5%',
    '95 kg × 3 · 102.5%',
    '70 kg × 8 · 75%',
  ]);
});

test('enroll in 5/3/1 with BBB, start with the "5+" badge and 5×10 rows, finish and see the next day', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('pe_531');
  await register(page, username);

  await openEnrollForm(page, '5/3/1');
  await expect(
    page.getByRole('radiogroup', { name: 'Supplemental work' }).getByRole('radio', { name: 'Boring But Big' }),
  ).toBeChecked();
  await expect(
    page.getByRole('radiogroup', { name: 'Training max percentage' }).getByRole('radio', { name: '90%' }),
  ).toBeChecked();
  await fillProgramInputs(page, FIVE_THREE_ONE_ONE_RMS_KG);
  await expect(page.getByText('Training max 90 kg', { exact: true })).toBeVisible();
  await startFollowing(page, '5/3/1');
  await expect
    .poll(() => activeEnrollmentOf(username))
    .toMatchObject({
      template_key: 'five_three_one',
      options: { supplemental: 'bbb', bbbPct: 0.5, bbbProgression: 'standard', tmPct: 0.9, tmReset: 0.1 },
      inputs: { squat: { oneRm: 100 }, bench: { oneRm: 80 }, deadlift: { oneRm: 140 }, press: { oneRm: 50 } },
    });

  const today = programToday(page, '5/3/1');
  await expect(dayPicker(today).getByRole('radio', { name: 'C1 W1 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(FIVE_THREE_ONE_W1_SQUAT_AT_TM_90);
  await expect(prescribedRows(today, 'Back Squat — supplemental')).toHaveText(BBB_AT_TM_90);

  await today.getByRole('button', { name: 'Start: 5/3/1 — C1 W1 Day 1', exact: true }).click();
  await expect(page.getByText('5/3/1 — C1 W1 Day 1', { exact: true })).toBeVisible();
  const [main, bbb] = [workoutCards(page, 'Back Squat').first(), workoutCards(page, 'Back Squat').last()];
  await expect(workoutCards(page, 'Back Squat')).toHaveCount(2);
  await expect.poll(() => weightsIn(main)).toEqual(['57.5', '67.5', '77.5']);
  await expect(setRow(main, 3).getByText('5+', { exact: true })).toBeVisible();
  await expect(setRow(main, 1).getByText('5+', { exact: true })).toHaveCount(0);
  await expect(setRow(main, 2).getByText('5+', { exact: true })).toHaveCount(0);
  await expect.poll(() => weightsIn(bbb)).toEqual(['45', '45', '45', '45', '45']);
  await expect.poll(() => repsIn(bbb)).toEqual(['10', '10', '10', '10', '10']);

  await markEverySetDone(page);
  await finishWorkout(page);
  await page.getByRole('link', { name: 'Done' }).click();

  const after = programToday(page, '5/3/1');
  await expect(dayPicker(after).getByRole('radio', { name: 'C1 W1 Day 2', exact: true })).toBeChecked();
  await expect(dayPicker(after).getByRole('radio', { name: 'C1 W1 Day 1', exact: true })).toHaveCount(0);
  await expect(after.getByRole('button', { name: 'Start: 5/3/1 — C1 W1 Day 2', exact: true })).toBeVisible();
});

test("edit the training max and see today's weights change", async ({ page }) => {
  const username = uniqueUsername('pe_tm');
  await register(page, username);
  await followProgram(page, '5/3/1', FIVE_THREE_ONE_ONE_RMS_KG);
  const today = programToday(page, '5/3/1');
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(FIVE_THREE_ONE_W1_SQUAT_AT_TM_90);

  await today.getByRole('link', { name: 'Manage program', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '5/3/1', exact: true })).toBeVisible();
  const squatTm = page.getByLabel('Squat training max (kg)', { exact: true });
  await expect(squatTm).toHaveValue('90');
  await expect(page.getByLabel('Bench press training max (kg)', { exact: true })).toHaveValue('72');
  await squatTm.fill('100');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await openTab(page, 'Train');
  const changed = programToday(page, '5/3/1');
  await expect(prescribedRows(changed, 'Back Squat')).toHaveText([
    '65 kg × 5 · 65%',
    '75 kg × 5 · 75%',
    '85 kg × 5+ · 85%',
  ]);
  await expect(prescribedRows(changed, 'Back Squat — supplemental')).toHaveText(['5 × 10 @ 50 kg · 50%']);
});

test("start today's workout offline after the program facts were loaded once", async ({ context, page }) => {
  test.setTimeout(150_000);
  const username = uniqueUsername('pe_off');
  await register(page, username);
  const { user } = await readSession(page);
  await followProgram(page, 'Madcow 5x5', MADCOW_FIVE_RMS_KG);
  await expect(prescribedRows(programToday(page, 'Madcow 5x5'), 'Back Squat')).toHaveText(MADCOW_W1_MONDAY_SQUAT);

  await context.setOffline(true);
  await openTab(page, 'Profile');
  await openTab(page, 'Train');
  const today = programToday(page, 'Madcow 5x5');
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(MADCOW_W1_MONDAY_SQUAT);
  await today.getByRole('button', { name: 'Start: Madcow 5x5 — W1 Day 1', exact: true }).click();
  await expect(page.getByText('Madcow 5x5 — W1 Day 1', { exact: true })).toBeVisible();
  await expect.poll(() => weightsIn(workoutCards(page, 'Back Squat'))).toEqual(['47.5', '57.5', '70', '80', '92.5']);
  await markEverySetDone(page);

  await context.setOffline(false);
  await finishWorkout(page);
  await expect
    .poll(async () => {
      const stored = await readStoredDraft(page, user.id);
      return stored?.syncedSessionId ? await sessionRow(stored.syncedSessionId) : null;
    })
    .toMatchObject({ enrollment_id: expect.any(String), program_position: { week: 1, day: 'mon' } });
});

test('a template with an unknown primitive kind is listed as "Update the app to use this program" and cannot be enrolled in', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const key = `e2e_stale_${suffix}`;
  const name = `Future program ${suffix}`;
  await insertProgramTemplate(key, name, staleTemplateDefinition(key, name));
  try {
    const username = uniqueUsername('pe_stale');
    await register(page, username);
    await openFromProfile(page, 'Programs');
    const programs = powerliftingPrograms(page);
    const stale = programs.getByRole('listitem').filter({ hasText: name });
    await expect(stale).toContainText('Update the app to use this program');
    await expect(stale.getByRole('link')).toHaveCount(0);
    await expect(stale.getByRole('button')).toHaveCount(0);
    await expect(programs.getByRole('link', { name: 'Use Madcow 5x5', exact: true })).toBeVisible();
    await expect(programs.getByRole('link', { name: 'Use 5/3/1', exact: true })).toBeVisible();

    await page.goto(`/programs/enroll/${key}`);
    await expect(page.getByText('Update the app to use this program', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start following', exact: true })).toHaveCount(0);
    expect(await activeEnrollmentOf(username)).toBeNull();
  } finally {
    await deleteProgramTemplate(key);
  }
});
