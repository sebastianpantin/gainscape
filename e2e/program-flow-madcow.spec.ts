import { expect, type Page, test } from '@playwright/test';
import { openTab, readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import {
  dayPicker,
  followProgram,
  MADCOW_FIVE_RMS_KG,
  prescribedRows,
  programToday,
} from './support/program-enrollment.ts';
import { madcowOnRampWeek, type MadcowWeekScript, seedProgramDays, sessionClock } from './support/program-seed.ts';

const MADCOW = 'Madcow 5x5';
const FIVE_RMS_KG = { squat: 100, bench: 80, row: 70, press: 50, deadlift: 140 } as const;

const SQUAT_TOP_102_5_RAMP = [
  '52.5 kg × 5 · 50%',
  '65 kg × 5 · 62.5%',
  '77.5 kg × 5 · 75%',
  '90 kg × 5 · 87.5%',
  '102.5 kg × 5 · 100%',
];

const SQUAT_TOP_100_RAMP = [
  '50 kg × 5 · 50%',
  '62.5 kg × 5 · 62.5%',
  '75 kg × 5 · 75%',
  '87.5 kg × 5 · 87.5%',
  '100 kg × 5 · 100%',
];

const BENCH_TOP_82_RAMP = [
  '42.5 kg × 5 · 50%',
  '52.5 kg × 5 · 62.5%',
  '62.5 kg × 5 · 75%',
  '72.5 kg × 5 · 87.5%',
  '82.5 kg × 5 · 100%',
];

const ROW_TOP_71_75_RAMP = [
  '37.5 kg × 5 · 50%',
  '45 kg × 5 · 62.5%',
  '55 kg × 5 · 75%',
  '62.5 kg × 5 · 87.5%',
  '72.5 kg × 5 · 100%',
];

async function followMadcowThroughOnRamp(page: Page, prefix: string, weekFour: MadcowWeekScript = {}) {
  const username = uniqueUsername(prefix);
  await register(page, username);
  await followProgram(page, MADCOW, MADCOW_FIVE_RMS_KG);
  const { access_token: accessToken } = await readSession(page);
  const enrollment = await activeEnrollmentOf(username);
  const days = [
    ...madcowOnRampWeek(FIVE_RMS_KG, 1),
    ...madcowOnRampWeek(FIVE_RMS_KG, 2),
    ...madcowOnRampWeek(FIVE_RMS_KG, 3),
    ...madcowOnRampWeek(FIVE_RMS_KG, 4, weekFour),
  ];
  await seedProgramDays(
    accessToken,
    await activeEnrollmentIdOf(username),
    enrollment.lift_bindings,
    sessionClock(days.length + 1),
    days,
  );
  await page.reload();
  await openTab(page, 'Train');
  const today = programToday(page, MADCOW);
  await expect(dayPicker(today).getByRole('radio', { name: 'W5 Day 1', exact: true })).toBeChecked();
  return today;
}

test('Madcow after a met on-ramp (tops 92.5, 95, 97.5, 100) suggests W5 Day 1 with the squat top at 100 × 1.025 = 102.5, ramping 51.25 → 52.5, 64.06 → 65, 76.88 → 77.5, 89.69 → 90', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const today = await followMadcowThroughOnRamp(page, 'pf_mc');

  await expect(dayPicker(today).getByRole('radio')).toHaveCount(3);
  await expect(today.getByRole('button', { name: `Start: ${MADCOW} — W5 Day 1`, exact: true })).toBeVisible();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(SQUAT_TOP_102_5_RAMP);
});

test('Madcow bench and row also progress 2.5% after a met week 4: bench 80 × 1.025 = 82 → 82.5, row 70 × 1.025 = 71.75 → 72.5', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const today = await followMadcowThroughOnRamp(page, 'pf_mcb');

  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText(BENCH_TOP_82_RAMP);
  await expect(prescribedRows(today, 'Barbell Row')).toHaveText(ROW_TOP_71_75_RAMP);
});

test('Madcow with a 4-rep W4 Day 1 squat top set holds the squat: W5 squat top stays at 100 (50, 62.5, 75, 87.5, 100) while bench goes to 82.5 and row to 72.5', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const today = await followMadcowThroughOnRamp(page, 'pf_mcm', { mondayTopReps: { squat: 4 } });

  await expect(prescribedRows(today, 'Back Squat')).toHaveText(SQUAT_TOP_100_RAMP);
  await expect(prescribedRows(today, 'Barbell Bench Press')).toHaveText(BENCH_TOP_82_RAMP);
  await expect(prescribedRows(today, 'Barbell Row')).toHaveText(ROW_TOP_71_75_RAMP);
});
