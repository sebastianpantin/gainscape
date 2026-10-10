import { expect, test } from './support/fixtures.ts';
import { readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import { dayPicker, followProgram, openProgramToday, prescribedRows, repeated } from './support/program-enrollment.ts';
import { fiveRepSets, type SeededDay, seedProgramDays, sessionClock } from './support/program-seed.ts';

const STRONGLIFTS = 'StrongLifts 5x5';
const FAILED_LAST_SET_REPS = 4;

const FAILED_SQUAT_SESSIONS: readonly SeededDay[] = [
  {
    position: { index: 0 },
    sets: [
      ...fiveRepSets('a-squat', 'squat', 100, 5, FAILED_LAST_SET_REPS),
      ...fiveRepSets('a-bench', 'bench', 60, 5),
      ...fiveRepSets('a-row', 'row', 50, 5),
    ],
  },
  {
    position: { index: 1 },
    sets: [
      ...fiveRepSets('b-squat', 'squat', 100, 5, FAILED_LAST_SET_REPS),
      ...fiveRepSets('b-press', 'press', 40, 5),
      ...fiveRepSets('b-deadlift', 'deadlift', 120, 1),
    ],
  },
  {
    position: { index: 2 },
    sets: [
      ...fiveRepSets('a-squat', 'squat', 100, 5, FAILED_LAST_SET_REPS),
      ...fiveRepSets('a-bench', 'bench', 62.5, 5),
      ...fiveRepSets('a-row', 'row', 52.5, 5),
    ],
  },
];

test('StrongLifts repeats a failed squat twice at 100, then the third failed session in a row deloads it 10% to 100 × 0.9 = 90 while press goes 40 + 2.5 = 42.5 and deadlift 120 + 5 = 125', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { accessToken, enrollmentId, bindings } =
    await test.step('follow StrongLifts at squat 100, bench 60, row 50, press 40 and deadlift 120', async () => {
      const username = uniqueUsername('pf_sl');
      await register(page, username);
      await followProgram(page, STRONGLIFTS, {
        'Squat working weight (kg)': 100,
        'Bench press working weight (kg)': 60,
        'Barbell row working weight (kg)': 50,
        'Overhead press working weight (kg)': 40,
        'Deadlift working weight (kg)': 120,
      });
      const { access_token: accessToken } = await readSession(page);
      const enrollmentId = await activeEnrollmentIdOf(username);
      const { lift_bindings: bindings } = await activeEnrollmentOf(username);
      return { accessToken, enrollmentId, bindings };
    });
  const clock = sessionClock(FAILED_SQUAT_SESSIONS.length + 1);

  await test.step('seed sessions 1 and 2, each missing the last squat rep at 100', async () => {
    await seedProgramDays(accessToken, enrollmentId, bindings, clock, FAILED_SQUAT_SESSIONS.slice(0, 2));
  });

  await test.step('session 3 repeats the squat at 100 while bench goes to 62.5 and row to 52.5', async () => {
    const afterTwoFails = await openProgramToday(page, STRONGLIFTS);
    await expect(dayPicker(afterTwoFails).getByRole('radio', { name: 'Session 3 Day 1', exact: true })).toBeChecked();
    await expect(prescribedRows(afterTwoFails, 'Back Squat')).toHaveText(repeated('100 kg × 5 · 100%', 5));
    await expect(prescribedRows(afterTwoFails, 'Barbell Bench Press')).toHaveText(repeated('62.5 kg × 5 · 100%', 5));
    await expect(prescribedRows(afterTwoFails, 'Barbell Row')).toHaveText(repeated('52.5 kg × 5 · 100%', 5));
  });

  await test.step('seed session 3, the third squat miss in a row', async () => {
    await seedProgramDays(accessToken, enrollmentId, bindings, clock, FAILED_SQUAT_SESSIONS.slice(2));
  });

  await test.step('session 4 deloads the squat to 90 while press goes to 42.5 and deadlift to 125', async () => {
    const afterThreeFails = await openProgramToday(page, STRONGLIFTS);
    await expect(dayPicker(afterThreeFails).getByRole('radio', { name: 'Session 4 Day 2', exact: true })).toBeChecked();
    await expect(prescribedRows(afterThreeFails, 'Back Squat')).toHaveText(repeated('90 kg × 5 · 100%', 5));
    await expect(prescribedRows(afterThreeFails, 'Overhead Press')).toHaveText(repeated('42.5 kg × 5 · 100%', 5));
    await expect(prescribedRows(afterThreeFails, 'Deadlift')).toHaveText(['125 kg × 5 · 100%']);
  });
});
