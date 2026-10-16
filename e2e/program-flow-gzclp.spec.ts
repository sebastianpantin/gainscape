import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { finishWorkout, openTab, readSession, register, setRow, setRows, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf, skipProgramDayElsewhere } from './support/db.ts';
import {
  bindExercise,
  dayPicker,
  fillProgramInputs,
  markEverySetDone,
  openEnrollForm,
  openManageProgram,
  openProgramToday,
  prescribedRows,
  programToday,
  repeated,
  repsIn,
  startFollowing,
  weightsIn,
  workoutCards,
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
  return await test.step('follow GZCLP with every lift bound to its exercise', async () => {
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
  });
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
  await test.step('seed rotation 1: squat T1 met, bench T2 missed, pulldown T3 last set of 25', async () => {
    const days = metFourDayRotation(0, dayOne, 42.5);
    await seedProgramDays(accessToken, enrollmentId, bindings, sessionClock(days.length + 1), days);
  });

  await test.step('session 5 prescribes squat 5×3 at 105, bench 3×8 at 50 and pulldown at 42.5', async () => {
    const today = await openProgramToday(page, GZCLP);
    await expect(dayPicker(today).getByRole('radio', { name: 'Session 5 Day 1', exact: true })).toBeChecked();
    await expect(prescribedRows(today, 'Back Squat')).toHaveText(stageRows('105', T1_STAGES[0]));
    await expect(prescribedRows(today, 'Barbell Bench Press — supplemental')).toHaveText(stageRows('50', T2_STAGES[1]));
    await expect(prescribedRows(today, 'Lat Pulldown — assistance')).toHaveText(stageRows('42.5', T3_STAGE));
  });
});

test('GZCLP: a T1 squat failing 5×3 then 6×2 at 100 moves to 6×2 then 10×1 at 100, where a met 10×1 goes 100 + 5 = 105, while a T2 bench failing 3×10 then 3×8 at 50 moves to 3×8 then 3×6 at 50, and failing 3×6 resets to 3×10 at 50 + 6.25 = 56.25, prescribed as 57.5', async ({
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

  await test.step('seed rotation 1 with squat 5×3 and bench 3×10 missed', async () => {
    await seedProgramDays(
      accessToken,
      enrollmentId,
      bindings,
      clock,
      metFourDayRotation(0, dayOne(T1_STAGES[0], missedBy(T1_STAGES[0]), T2_STAGES[0]), 40),
    );
  });

  await test.step('session 5 moves squat to 6×2 and bench to 3×8, both at their weights', async () => {
    const afterOneFail = await openProgramToday(page, GZCLP);
    await expect(dayPicker(afterOneFail).getByRole('radio', { name: 'Session 5 Day 1', exact: true })).toBeChecked();
    await expect(prescribedRows(afterOneFail, 'Back Squat')).toHaveText(stageRows('100', T1_STAGES[1]));
    await expect(prescribedRows(afterOneFail, 'Barbell Bench Press — supplemental')).toHaveText(
      stageRows('50', T2_STAGES[1]),
    );
  });

  await test.step('seed rotation 2 with squat 6×2 and bench 3×8 missed', async () => {
    await seedProgramDays(
      accessToken,
      enrollmentId,
      bindings,
      clock,
      metFourDayRotation(1, dayOne(T1_STAGES[1], missedBy(T1_STAGES[1]), T2_STAGES[1]), 40),
    );
  });

  await test.step('session 9 moves squat to 10×1 and bench to 3×6', async () => {
    const afterTwoFails = await openProgramToday(page, GZCLP);
    await expect(dayPicker(afterTwoFails).getByRole('radio', { name: 'Session 9 Day 1', exact: true })).toBeChecked();
    await expect(prescribedRows(afterTwoFails, 'Back Squat')).toHaveText(stageRows('100', T1_STAGES[2]));
    await expect(prescribedRows(afterTwoFails, 'Barbell Bench Press — supplemental')).toHaveText(
      stageRows('50', T2_STAGES[2]),
    );
  });

  await test.step('seed rotation 3 with squat 10×1 met and bench 3×6 missed', async () => {
    await seedProgramDays(
      accessToken,
      enrollmentId,
      bindings,
      clock,
      metFourDayRotation(2, dayOne(T1_STAGES[2], T1_STAGES[2].reps, T2_STAGES[2]), 40),
    );
  });

  await test.step('session 13 raises squat 10×1 to 105 and resets bench to 3×10 at 57.5', async () => {
    const afterThreeRotations = await openProgramToday(page, GZCLP);
    await expect(
      dayPicker(afterThreeRotations).getByRole('radio', { name: 'Session 13 Day 1', exact: true }),
    ).toBeChecked();
    await expect(prescribedRows(afterThreeRotations, 'Back Squat')).toHaveText(stageRows('105', T1_STAGES[2]));
    await expect(prescribedRows(afterThreeRotations, 'Barbell Bench Press — supplemental')).toHaveText(
      stageRows('57.5', T2_STAGES[0]),
    );
  });
});

const FIVE_RM_TEST_ROW = 'any weight × 5 · 5RM test';

type Enrolled = Awaited<ReturnType<typeof followGzclp>>;

async function seedFailedSquatRotation(
  { accessToken, enrollmentId, bindings }: Enrolled,
  clock: ReturnType<typeof sessionClock>,
  rotation: number,
) {
  const squatWithLightLastSet = stageSets('a1-squat-t1', 'squat-t1', 100, T1_STAGES[rotation]).map(
    (set, index, sets) => (index === sets.length - 1 ? { ...set, loggedWeightKg: 90 } : set),
  );
  const dayOne = [
    ...squatWithLightLastSet,
    ...stageSets('a1-bench-t2', 'bench-t2', 50, T2_STAGES[0]),
    ...stageSets('a1-pulldown-t3', 'pulldown-t3', 40, T3_STAGE),
  ];
  await seedProgramDays(accessToken, enrollmentId, bindings, clock, metFourDayRotation(rotation, dayOne, 40));
}

test('GZCLP: a T1 squat failing 5×3, 6×2 and 10×1 at 100 (last set at 90) prescribes a 5RM test, also offered on Manage program only after the 10×1 fail, and a Squat T1 5RM of 110 restarts 5×3 at 110 × 0.85 = 93.5, prescribed as 92.5', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const enrolled = await followGzclp(page, 'pf_gzr');
  const clock = sessionClock(3 * ROTATION_DAYS + 1);
  const seedFailedRotation = (rotation: number) => seedFailedSquatRotation(enrolled, clock, rotation);
  const squatFiveRm = page.getByLabel('Squat T1 5RM (kg)', { exact: true });

  await test.step('seed rotations 1 and 2 failing squat 5×3 and 6×2', async () => {
    await seedFailedRotation(0);
    await seedFailedRotation(1);
  });

  await test.step('at 10×1 the squat has no 5RM field on Manage program yet', async () => {
    const atTenSingles = await openProgramToday(page, GZCLP);
    await expect(prescribedRows(atTenSingles, 'Back Squat')).toHaveText(stageRows('100', T1_STAGES[2]));
    await openManageProgram(page, GZCLP);
    await expect(page.getByLabel('Squat T1 working weight (kg)', { exact: true })).toHaveValue('100');
    await expect(squatFiveRm).toHaveCount(0);
  });

  await test.step('seed rotation 3 failing squat 10×1', async () => {
    await seedFailedRotation(2);
  });

  await test.step('session 13 prescribes a squat 5RM test', async () => {
    const afterLastStageFail = await openProgramToday(page, GZCLP);
    await expect(
      dayPicker(afterLastStageFail).getByRole('radio', { name: 'Session 13 Day 1', exact: true }),
    ).toBeChecked();
    await expect(prescribedRows(afterLastStageFail, 'Back Squat')).toHaveText([FIVE_RM_TEST_ROW]);
  });

  await test.step('enter a Squat T1 5RM of 110 on Manage program', async () => {
    await openManageProgram(page, GZCLP);
    await expect(squatFiveRm).toHaveValue('');
    await expect(page.getByLabel('Bench press T1 5RM (kg)', { exact: true })).toHaveCount(0);
    await squatFiveRm.fill('110');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    await expect(squatFiveRm).toHaveCount(0);
  });

  await test.step('Train restarts squat 5×3 at 92.5', async () => {
    await openTab(page, 'Train');
    const restarted = programToday(page, GZCLP);
    await expect(prescribedRows(restarted, 'Back Squat')).toHaveText(stageRows('92.5', T1_STAGES[0]));
  });
});

test('GZCLP: after a T1 squat fails 10×1 the Train card prescribes a 5RM test, and logging it at 100 × 5 then 110 × 5 sets the 5RM to 110 and restarts 5×3 at 110 × 0.85 = 93.5, prescribed as 92.5', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const enrolled = await followGzclp(page, 'pf_gzt');
  const clock = sessionClock(3 * ROTATION_DAYS + 1);
  await test.step('seed rotations 1 to 3 failing squat 5×3, 6×2 and 10×1', async () => {
    for (const rotation of [0, 1, 2]) await seedFailedSquatRotation(enrolled, clock, rotation);
  });

  const today = await test.step('session 13 prescribes a squat 5RM test and bench 3×10 at 57.5', async () => {
    const programToday = await openProgramToday(page, GZCLP);
    await expect(dayPicker(programToday).getByRole('radio', { name: 'Session 13 Day 1', exact: true })).toBeChecked();
    await expect(prescribedRows(programToday, 'Back Squat')).toHaveText([FIVE_RM_TEST_ROW]);
    await expect(prescribedRows(programToday, 'Barbell Bench Press — supplemental')).toHaveText(
      stageRows('57.5', T2_STAGES[0]),
    );
    return programToday;
  });

  await test.step('log the 5RM test at 100 × 5 and 110 × 5', async () => {
    await today.getByRole('button', { name: `Start: ${GZCLP} — Session 13 Day 1`, exact: true }).click();
    const squat = workoutCards(page, 'Back Squat');
    await expect(squat).toHaveCount(1);
    await expect(setRows(squat)).toHaveCount(1);
    await expect.poll(() => weightsIn(squat)).toEqual(['100']);
    await setRow(squat, 1)
      .getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ })
      .fill('100');
    await expect(setRow(squat, 1).getByRole('spinbutton', { name: /^Reps, set \d+$/ })).toHaveValue('5');
    await markEverySetDone(page);
    await squat.getByRole('button', { name: '+ Add set' }).click();
    await setRow(squat, 2)
      .getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ })
      .fill('110');
    await expect.poll(() => weightsIn(squat)).toEqual(['100', '110']);
    await expect.poll(() => repsIn(squat)).toEqual(['5', '5']);
    await setRow(squat, 2).getByRole('button', { name: 'Done set 2' }).click();
    await finishWorkout(page);
    await page.getByRole('link', { name: 'Done' }).click();
  });

  await test.step('skip the rest of the rotation elsewhere', async () => {
    for (const index of [13, 14, 15]) await skipProgramDayElsewhere(enrolled.enrollmentId, { index });
  });

  await test.step('session 17 restarts squat 5×3 at 92.5 from a working weight of 93.5', async () => {
    const restarted = await openProgramToday(page, GZCLP);
    await expect(dayPicker(restarted).getByRole('radio', { name: 'Session 17 Day 1', exact: true })).toBeChecked();
    await expect(prescribedRows(restarted, 'Back Squat')).toHaveText(stageRows('92.5', T1_STAGES[0]));
    await openManageProgram(page, GZCLP);
    await expect(page.getByLabel('Squat T1 working weight (kg)', { exact: true })).toHaveValue('93.5');
    await expect(page.getByLabel('Squat T1 5RM (kg)', { exact: true })).toHaveCount(0);
  });
});
