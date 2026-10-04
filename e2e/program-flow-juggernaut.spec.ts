import { expect, type Locator, type Page, test } from '@playwright/test';
import { openTab, readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import { dayPicker, followProgram, prescribedRows, programToday, repeated } from './support/program-enrollment.ts';
import {
  nearestPlateKg,
  type SeededDay,
  type SeededSet,
  seedProgramDays,
  sessionClock,
} from './support/program-seed.ts';

const JUGGERNAUT = 'Juggernaut Method 2.0 (structure)';
type JuggernautLift = 'squat' | 'bench' | 'deadlift' | 'press';
type AmrapReps = Readonly<Record<JuggernautLift, number>>;

const DAY_ORDER: readonly JuggernautLift[] = ['squat', 'bench', 'deadlift', 'press'];
const TMS_KG: Readonly<Record<JuggernautLift, number>> = { squat: 100, bench: 80, deadlift: 140, press: 50 };

interface WaveSet {
  pct: number;
  reps: number;
  amrap?: boolean;
}

function straight(pct: number, reps: number, count: number): WaveSet[] {
  return Array.from({ length: count }, (_, index) => ({ pct, reps, amrap: index === count - 1 }));
}

const TEN_REP_WAVE: readonly (readonly WaveSet[])[] = [
  straight(0.6, 10, 5),
  [
    { pct: 0.675, reps: 10 },
    { pct: 0.675, reps: 10 },
    { pct: 0.675, reps: 10 },
  ],
  [{ pct: 0.75, reps: 10, amrap: true }],
  [
    { pct: 0.4, reps: 5 },
    { pct: 0.5, reps: 5 },
    { pct: 0.6, reps: 5 },
  ],
];
const REALISATION_WEEK = 3;

function weekSets(lift: JuggernautLift, week: number, realisationReps: number): SeededSet[] {
  return TEN_REP_WAVE[week - 1].map(({ pct, reps, amrap }, index) => {
    const set = { lift, ref: `${lift}-main:${index}`, weightKg: nearestPlateKg(TMS_KG[lift] * pct), reps };
    if (!amrap) return set;
    const amrapSet = { ...set, amrap: true, minReps: reps };
    return week === REALISATION_WEEK ? { ...amrapSet, loggedReps: realisationReps } : amrapSet;
  });
}

function tenRepWave(realisationReps: AmrapReps): SeededDay[] {
  return [1, 2, 3, 4].flatMap((week) =>
    DAY_ORDER.map((lift) => ({
      position: { cycle: 1, week, day: lift },
      sets: weekSets(lift, week, realisationReps[lift]),
    })),
  );
}

async function followAndSeedTenRepWave(page: Page, prefix: string, realisationReps: AmrapReps): Promise<Locator> {
  const username = uniqueUsername(prefix);
  await register(page, username);
  await followProgram(page, JUGGERNAUT, {
    'Squat training max (kg)': TMS_KG.squat,
    'Bench press training max (kg)': TMS_KG.bench,
    'Deadlift training max (kg)': TMS_KG.deadlift,
    'Overhead press training max (kg)': TMS_KG.press,
  });
  const { access_token: accessToken } = await readSession(page);
  const enrollmentId = await activeEnrollmentIdOf(username);
  const { lift_bindings: bindings } = await activeEnrollmentOf(username);
  const days = tenRepWave(realisationReps);
  await seedProgramDays(accessToken, enrollmentId, bindings, sessionClock(days.length + 1), days);

  await page.reload();
  await openTab(page, 'Train');
  const today = programToday(page, JUGGERNAUT);
  await expect(today).toBeVisible();
  await expect(dayPicker(today).getByRole('radio', { name: 'C1 W5 Day 1', exact: true })).toBeChecked();
  return today;
}

function eightRepAccumulation(weightKg: string): string[] {
  return [...repeated(`${weightKg} kg × 8 · 65%`, 4), `${weightKg} kg × 8+ · 65%`];
}

async function expectWeekFiveDay(today: Locator, day: string, exercise: string, weightKg: string): Promise<void> {
  await dayPicker(today)
    .getByRole('radio', { name: `C1 W5 ${day}`, exact: true })
    .click();
  await expect(today.getByRole('button', { name: `Start: ${JUGGERNAUT} — C1 W5 ${day}`, exact: true })).toBeVisible();
  await expect(prescribedRows(today, exercise)).toHaveText(eightRepAccumulation(weightKg));
}

test('Juggernaut after the 10s wave raises each TM by reps over the standard 10 on the W3 AMRAP: squat 14 reps 100 + 4 × 2.5 = 110, bench 13 reps 80 + 3 × 1.25 = 83.75, deadlift and press exactly 10 stay 140 and 50; W5 8s at 65%: squat 71.5 → 72.5, bench 54.44 → 55, deadlift 91 → 90, press 32.5', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const today = await followAndSeedTenRepWave(page, 'pf_jug', { squat: 14, bench: 13, deadlift: 10, press: 10 });

  await expectWeekFiveDay(today, 'Day 1', 'Back Squat', '72.5');
  await expectWeekFiveDay(today, 'Day 2', 'Barbell Bench Press', '55');
  await expectWeekFiveDay(today, 'Day 3', 'Deadlift', '90');
  await expectWeekFiveDay(today, 'Day 4', 'Overhead Press', '32.5');
});

test('Juggernaut caps the W3 AMRAP bonus at 10 reps over the standard: squat 25 reps 100 + 10 × 2.5 = 125, press 22 reps 50 + 10 × 1.25 = 62.5; W5 8s at 65%: squat 81.25 → 82.5, press 40.63 → 40', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const today = await followAndSeedTenRepWave(page, 'pf_jugc', { squat: 25, bench: 10, deadlift: 10, press: 22 });

  await expectWeekFiveDay(today, 'Day 1', 'Back Squat', '82.5');
  await expectWeekFiveDay(today, 'Day 4', 'Overhead Press', '40');
});
