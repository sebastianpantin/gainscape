import { expect, type Page, test } from '@playwright/test';
import { openTab, readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import {
  bindExercise,
  dayPicker,
  fillProgramInputs,
  openEnrollForm,
  prescribedRows,
  programToday,
  repeated,
  startFollowing,
} from './support/program-enrollment.ts';
import { type SeededDay, type SeededSet, seedProgramDays, sessionClock } from './support/program-seed.ts';

const GZCLP = 'GZCLP';
const ROTATION_DAYS = 4;

const WORKING_WEIGHTS_KG: Readonly<Record<string, number>> = {
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
};

const EXERCISE_BY_LIFT_NAME: Readonly<Record<string, string>> = {
  'Squat T1': 'Back Squat',
  'Bench press T1': 'Barbell Bench Press',
  'Overhead press T1': 'Overhead Press',
  'Deadlift T1': 'Deadlift',
  'Squat T2': 'Back Squat',
  'Bench press T2': 'Barbell Bench Press',
  'Overhead press T2': 'Overhead Press',
  'Deadlift T2': 'Deadlift',
  'Lat pulldown T3': 'Lat Pulldown',
  'Dumbbell row T3': 'Dumbbell Row',
};

interface Stage {
  sets: number;
  reps: number;
  amrapLast: boolean;
}

const T1_STAGES: readonly Stage[] = [
  { sets: 5, reps: 3, amrapLast: true },
  { sets: 6, reps: 2, amrapLast: true },
  { sets: 10, reps: 1, amrapLast: true },
];

const T2_STAGES: readonly Stage[] = [
  { sets: 3, reps: 10, amrapLast: false },
  { sets: 3, reps: 8, amrapLast: false },
  { sets: 3, reps: 6, amrapLast: false },
];

const T3_STAGE: Stage = { sets: 3, reps: 15, amrapLast: true };
const T3_THRESHOLD_REPS = 25;

function stageSets(slot: string, lift: string, weightKg: number, stage: Stage, lastSetReps?: number): SeededSet[] {
  return Array.from({ length: stage.sets }, (_, index) => {
    const isLast = index === stage.sets - 1;
    const amrap = stage.amrapLast && isLast;
    const set = {
      lift,
      ref: `${slot}:${index}`,
      weightKg,
      reps: stage.reps,
      amrap,
      minReps: amrap ? stage.reps : null,
    };
    return isLast && lastSetReps !== undefined ? { ...set, loggedReps: lastSetReps } : set;
  });
}

function missedBy(stage: Stage): number {
  return stage.reps - 1;
}

function metFourDayRotation(rotation: number, dayOne: readonly SeededSet[], dayThreePulldownKg: number): SeededDay[] {
  const first = rotation * ROTATION_DAYS;
  return [
    { position: { index: first }, sets: dayOne },
    {
      position: { index: first + 1 },
      sets: [
        ...stageSets('b1-ohp-t1', 'ohp-t1', 40 + 2.5 * rotation, T1_STAGES[0]),
        ...stageSets('b1-deadlift-t2', 'deadlift-t2', 90 + 5 * rotation, T2_STAGES[0]),
        ...stageSets('b1-row-t3', 'row-t3', 20, T3_STAGE),
      ],
    },
    {
      position: { index: first + 2 },
      sets: [
        ...stageSets('a2-bench-t1', 'bench-t1', 60 + 2.5 * rotation, T1_STAGES[0]),
        ...stageSets('a2-squat-t2', 'squat-t2', 70 + 5 * rotation, T2_STAGES[0]),
        ...stageSets('a2-pulldown-t3', 'pulldown-t3', dayThreePulldownKg, T3_STAGE),
      ],
    },
    {
      position: { index: first + 3 },
      sets: [
        ...stageSets('b2-deadlift-t1', 'deadlift-t1', 120 + 5 * rotation, T1_STAGES[0]),
        ...stageSets('b2-ohp-t2', 'ohp-t2', 30 + 2.5 * rotation, T2_STAGES[0]),
        ...stageSets('b2-row-t3', 'row-t3', 20, T3_STAGE),
      ],
    },
  ];
}

async function followGzclp(page: Page, prefix: string) {
  const username = uniqueUsername(prefix);
  await register(page, username);
  await openEnrollForm(page, GZCLP);
  await fillProgramInputs(page, WORKING_WEIGHTS_KG);
  for (const [liftName, exerciseName] of Object.entries(EXERCISE_BY_LIFT_NAME))
    await bindExercise(page, liftName, exerciseName);
  await startFollowing(page, GZCLP);
  const { access_token: accessToken } = await readSession(page);
  const enrollmentId = await activeEnrollmentIdOf(username);
  const { lift_bindings: bindings } = await activeEnrollmentOf(username);
  return { accessToken, enrollmentId, bindings };
}

async function openToday(page: Page) {
  await page.reload();
  await openTab(page, 'Train');
  const today = programToday(page, GZCLP);
  await expect(today).toBeVisible();
  return today;
}

function stageRows(weight: string, stage: Stage): string[] {
  const row = `${weight} kg × ${stage.reps}`;
  if (!stage.amrapLast) return repeated(`${row} · 100%`, stage.sets);
  return [...repeated(`${row} · 100%`, stage.sets - 1), `${row}+ · 100%`];
}

test('GZCLP after one rotation: a met T1 squat 5×3 goes 100 + 5 = 105, a missed T2 bench 3×10 moves to 3×8 at 50, and a T3 pulldown last set of 25 goes 40 + 2.5 = 42.5, then holds at 42.5 after a 15-rep last set', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { accessToken, enrollmentId, bindings } = await followGzclp(page, 'pf_gzm');
  const dayOne = [
    ...stageSets('a1-squat-t1', 'squat-t1', 100, T1_STAGES[0]),
    ...stageSets('a1-bench-t2', 'bench-t2', 50, T2_STAGES[0], missedBy(T2_STAGES[0])),
    ...stageSets('a1-pulldown-t3', 'pulldown-t3', 40, T3_STAGE, T3_THRESHOLD_REPS),
  ];
  const days = metFourDayRotation(0, dayOne, 42.5);
  await seedProgramDays(accessToken, enrollmentId, bindings, sessionClock(days.length + 1), days);

  const today = await openToday(page);
  await expect(dayPicker(today).getByRole('radio', { name: 'Session 5 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(today, 'Back Squat')).toHaveText(stageRows('105', T1_STAGES[0]));
  await expect(prescribedRows(today, 'Barbell Bench Press — supplemental')).toHaveText(stageRows('50', T2_STAGES[1]));
  await expect(prescribedRows(today, 'Lat Pulldown — assistance')).toHaveText(stageRows('42.5', T3_STAGE));
});

test('GZCLP: a T1 squat failing 5×3 and 6×2 at 100 moves to 10×1, where a met 10×1 goes 100 + 5 = 105, while a T2 bench failing 3×10, 3×8 and 3×6 at 50 resets to 3×10 at 50 + 6.25 = 56.25, prescribed as 57.5', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { accessToken, enrollmentId, bindings } = await followGzclp(page, 'pf_gzs');
  const clock = sessionClock(3 * ROTATION_DAYS + 1);
  const dayOne = (squatStage: Stage, squatLastReps: number, benchStage: Stage) => [
    ...stageSets('a1-squat-t1', 'squat-t1', 100, squatStage, squatLastReps),
    ...stageSets('a1-bench-t2', 'bench-t2', 50, benchStage, missedBy(benchStage)),
    ...stageSets('a1-pulldown-t3', 'pulldown-t3', 40, T3_STAGE),
  ];

  await seedProgramDays(
    accessToken,
    enrollmentId,
    bindings,
    clock,
    metFourDayRotation(0, dayOne(T1_STAGES[0], missedBy(T1_STAGES[0]), T2_STAGES[0]), 40),
  );
  const afterOneFail = await openToday(page);
  await expect(dayPicker(afterOneFail).getByRole('radio', { name: 'Session 5 Day 1', exact: true })).toBeChecked();
  await expect(prescribedRows(afterOneFail, 'Back Squat')).toHaveText(stageRows('100', T1_STAGES[1]));
  await expect(prescribedRows(afterOneFail, 'Barbell Bench Press — supplemental')).toHaveText(
    stageRows('50', T2_STAGES[1]),
  );

  await seedProgramDays(accessToken, enrollmentId, bindings, clock, [
    ...metFourDayRotation(1, dayOne(T1_STAGES[1], missedBy(T1_STAGES[1]), T2_STAGES[1]), 40),
    ...metFourDayRotation(2, dayOne(T1_STAGES[2], T1_STAGES[2].reps, T2_STAGES[2]), 40),
  ]);
  const afterThreeRotations = await openToday(page);
  await expect(
    dayPicker(afterThreeRotations).getByRole('radio', { name: 'Session 13 Day 1', exact: true }),
  ).toBeChecked();
  await expect(prescribedRows(afterThreeRotations, 'Back Squat')).toHaveText(stageRows('105', T1_STAGES[2]));
  await expect(prescribedRows(afterThreeRotations, 'Barbell Bench Press — supplemental')).toHaveText(
    stageRows('57.5', T2_STAGES[0]),
  );
});
