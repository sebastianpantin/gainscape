import { expect, type Locator, type Page, test } from '@playwright/test';
import { openTab, readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import { dayPicker, followProgram, prescribedRows, programToday, repeated } from './support/program-enrollment.ts';
import { type SeededDay, type SeededSet, seedProgramDays, sessionClock } from './support/program-seed.ts';

const STARTING_STRENGTH = 'Starting Strength';
const FAILED_LAST_SET_REPS = 4;

const WORKING_WEIGHTS_KG = {
  'Squat working weight (kg)': 60,
  'Bench press working weight (kg)': 50,
  'Press working weight (kg)': 35,
  'Deadlift working weight (kg)': 80,
};

function sets(slot: string, lift: string, weightKg: number, count: number, lastSetReps?: number): SeededSet[] {
  return Array.from({ length: count }, (_, index) => {
    const set = { lift, ref: `${slot}:${index}`, weightKg, reps: 5 };
    return index === count - 1 && lastSetReps !== undefined ? { ...set, loggedReps: lastSetReps } : set;
  });
}

interface DayWeights {
  squat: number;
  upper: number;
  deadlift: number;
  upperLastSetReps?: number;
}

function dayOne(index: number, { squat, upper, deadlift, upperLastSetReps }: DayWeights): SeededDay {
  return {
    position: { index },
    sets: [
      ...sets('a-squat', 'squat', squat, 3),
      ...sets('a-bench', 'bench', upper, 3, upperLastSetReps),
      ...sets('a-deadlift', 'deadlift', deadlift, 1),
    ],
  };
}

function dayTwo(index: number, { squat, upper, deadlift, upperLastSetReps }: DayWeights): SeededDay {
  return {
    position: { index },
    sets: [
      ...sets('b-squat', 'squat', squat, 3),
      ...sets('b-press', 'press', upper, 3, upperLastSetReps),
      ...sets('b-deadlift', 'deadlift', deadlift, 1),
    ],
  };
}

interface FollowedStartingStrength {
  seed(days: readonly SeededDay[]): Promise<void>;
}

async function followStartingStrength(page: Page, prefix: string, sessions: number): Promise<FollowedStartingStrength> {
  const username = uniqueUsername(prefix);
  await register(page, username);
  await followProgram(page, STARTING_STRENGTH, WORKING_WEIGHTS_KG);
  const { access_token: accessToken } = await readSession(page);
  const enrollmentId = await activeEnrollmentIdOf(username);
  const { lift_bindings: bindings } = await activeEnrollmentOf(username);
  const clock = sessionClock(sessions + 1);
  return { seed: (days) => seedProgramDays(accessToken, enrollmentId, bindings, clock, days) };
}

async function openToday(page: Page): Promise<Locator> {
  await page.reload();
  await openTab(page, 'Train');
  const today = programToday(page, STARTING_STRENGTH);
  await expect(today).toBeVisible();
  return today;
}

test('Starting Strength opens the squat at +5 for its first two met sessions (60 + 5 = 65, 65 + 5 = 70) then +2.5 (70 + 2.5 = 72.5), while deadlift goes 80 + 2.5 × 3 = 87.5 over both days and press 35 + 2.5 = 37.5', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const program = await followStartingStrength(page, 'pf_ss', 3);
  await program.seed([
    dayOne(0, { squat: 60, upper: 50, deadlift: 80 }),
    dayTwo(1, { squat: 65, upper: 35, deadlift: 82.5 }),
    dayOne(2, { squat: 70, upper: 52.5, deadlift: 85 }),
  ]);

  const today = await openToday(page);
  await expect(dayPicker(today).getByRole('radio', { name: 'Session 4 Day 2', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(repeated('72.5 kg × 5 · 100%', 3));
  await expect(prescribedRows(today, 'Overhead Press')).toHaveText(repeated('37.5 kg × 5 · 100%', 3));
  await expect(prescribedRows(today, 'Deadlift')).toHaveText(['87.5 kg × 5 · 100%']);
});

test('Starting Strength holds a bench missed once at 50, then the second miss in a row deloads it 10% to 50 × 0.9 = 45 while squat goes 60 → 65 → 70 → 72.5 → 75 and deadlift 80 + 2.5 × 4 = 90', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const program = await followStartingStrength(page, 'pf_ssd', 4);
  await program.seed([
    dayOne(0, { squat: 60, upper: 50, deadlift: 80, upperLastSetReps: FAILED_LAST_SET_REPS }),
    dayTwo(1, { squat: 65, upper: 35, deadlift: 82.5 }),
  ]);

  const afterOneMiss = await openToday(page);
  await expect(dayPicker(afterOneMiss).getByRole('radio', { name: 'Session 3 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(afterOneMiss, 'Barbell Bench Press')).toHaveText(repeated('50 kg × 5 · 100%', 3));
  await expect(prescribedRows(afterOneMiss, 'Back Squat')).toHaveText(repeated('70 kg × 5 · 100%', 3));

  await program.seed([
    dayOne(2, { squat: 70, upper: 50, deadlift: 85, upperLastSetReps: FAILED_LAST_SET_REPS }),
    dayTwo(3, { squat: 72.5, upper: 37.5, deadlift: 87.5 }),
  ]);

  const afterTwoMisses = await openToday(page);
  await expect(dayPicker(afterTwoMisses).getByRole('radio', { name: 'Session 5 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(afterTwoMisses, 'Barbell Bench Press')).toHaveText(repeated('45 kg × 5 · 100%', 3));
  await expect(prescribedRows(afterTwoMisses, 'Back Squat')).toHaveText(repeated('75 kg × 5 · 100%', 3));
  await expect(prescribedRows(afterTwoMisses, 'Deadlift')).toHaveText(['90 kg × 5 · 100%']);
});
