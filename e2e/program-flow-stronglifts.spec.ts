import { expect, type Page, test } from '@playwright/test';
import { openTab, readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import { dayPicker, followProgram, prescribedRows, programToday, repeated } from './support/program-enrollment.ts';
import { type SeededDay, type SeededSet, seedProgramDays, sessionClock } from './support/program-seed.ts';

const STRONGLIFTS = 'StrongLifts 5x5';
const FAILED_LAST_SET_REPS = 4;

function sets(slot: string, lift: string, weightKg: number, count: number, lastSetReps?: number): SeededSet[] {
  return Array.from({ length: count }, (_, index) => {
    const set = { lift, ref: `${slot}:${index}`, weightKg, reps: 5 };
    return index === count - 1 && lastSetReps !== undefined ? { ...set, loggedReps: lastSetReps } : set;
  });
}

const FAILED_SQUAT_SESSIONS: readonly SeededDay[] = [
  {
    position: { index: 0 },
    sets: [
      ...sets('a-squat', 'squat', 100, 5, FAILED_LAST_SET_REPS),
      ...sets('a-bench', 'bench', 60, 5),
      ...sets('a-row', 'row', 50, 5),
    ],
  },
  {
    position: { index: 1 },
    sets: [
      ...sets('b-squat', 'squat', 100, 5, FAILED_LAST_SET_REPS),
      ...sets('b-press', 'press', 40, 5),
      ...sets('b-deadlift', 'deadlift', 120, 1),
    ],
  },
  {
    position: { index: 2 },
    sets: [
      ...sets('a-squat', 'squat', 100, 5, FAILED_LAST_SET_REPS),
      ...sets('a-bench', 'bench', 62.5, 5),
      ...sets('a-row', 'row', 52.5, 5),
    ],
  },
];

async function openToday(page: Page) {
  await page.reload();
  await openTab(page, 'Train');
  return programToday(page, STRONGLIFTS);
}

test('StrongLifts repeats a failed squat twice at 100, then the third failed session in a row deloads it 10% to 100 × 0.9 = 90 while press goes 40 + 2.5 = 42.5 and deadlift 120 + 5 = 125', async ({
  page,
}) => {
  test.setTimeout(180_000);
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
  const clock = sessionClock(FAILED_SQUAT_SESSIONS.length + 1);

  await seedProgramDays(accessToken, enrollmentId, bindings, clock, FAILED_SQUAT_SESSIONS.slice(0, 2));
  const afterTwoFails = await openToday(page);
  await expect(dayPicker(afterTwoFails).getByRole('radio', { name: 'Session 3 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(afterTwoFails, 'Back Squat')).toHaveText(repeated('100 kg × 5 · 100%', 5));
  await expect(prescribedRows(afterTwoFails, 'Barbell Bench Press')).toHaveText(repeated('62.5 kg × 5 · 100%', 5));
  await expect(prescribedRows(afterTwoFails, 'Barbell Row')).toHaveText(repeated('52.5 kg × 5 · 100%', 5));

  await seedProgramDays(accessToken, enrollmentId, bindings, clock, FAILED_SQUAT_SESSIONS.slice(2));
  const afterThreeFails = await openToday(page);
  await expect(dayPicker(afterThreeFails).getByRole('radio', { name: 'Session 4 Day 2', exact: true })).toBeChecked();
  await expect(prescribedRows(afterThreeFails, 'Back Squat')).toHaveText(repeated('90 kg × 5 · 100%', 5));
  await expect(prescribedRows(afterThreeFails, 'Overhead Press')).toHaveText(repeated('42.5 kg × 5 · 100%', 5));
  await expect(prescribedRows(afterThreeFails, 'Deadlift')).toHaveText(['125 kg × 5 · 100%']);
});
