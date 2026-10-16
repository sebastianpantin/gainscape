import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf, forgetSessionCreateLimits } from './support/db.ts';
import {
  cycleSummary,
  dayPicker,
  FIVE_THREE_ONE_ONE_RMS_KG,
  followProgram,
  openProgramToday,
  prescribedRows,
} from './support/program-enrollment.ts';
import {
  fiveThreeOneBbbCycle,
  type FiveThreeOneCycleScript,
  type FiveThreeOneLift,
  seedProgramDays,
  sessionClock,
  type SessionClock,
} from './support/program-seed.ts';

const FIVE_THREE_ONE = '5/3/1';
const CYCLE_1_TMS_KG = { squat: 90, bench: 72, deadlift: 126, press: 45 } as const;
const CYCLE_2_TMS_KG = { squat: 95, bench: 74.5, deadlift: 131, press: 47.5 } as const;
const SESSIONS_PER_CYCLE = 16;

interface WeekOneDay {
  day: string;
  exercise: string;
  main: readonly string[];
  bbbRow: string;
}

const C2_W1_DAYS: readonly WeekOneDay[] = [
  {
    day: 'Day 1',
    exercise: 'Back Squat',
    main: ['62.5 kg × 5 · 65%', '72.5 kg × 5 · 75%', '80 kg × 5+ · 85%'],
    bbbRow: '5 × 10 @ 47.5 kg · 50%',
  },
  {
    day: 'Day 2',
    exercise: 'Barbell Bench Press',
    main: ['47.5 kg × 5 · 65%', '55 kg × 5 · 75%', '62.5 kg × 5+ · 85%'],
    bbbRow: '5 × 10 @ 37.5 kg · 50%',
  },
  {
    day: 'Day 3',
    exercise: 'Deadlift',
    main: ['85 kg × 5 · 65%', '97.5 kg × 5 · 75%', '112.5 kg × 5+ · 85%'],
    bbbRow: '5 × 10 @ 65 kg · 50%',
  },
  {
    day: 'Day 4',
    exercise: 'Overhead Press',
    main: ['30 kg × 5 · 65%', '35 kg × 5 · 75%', '40 kg × 5+ · 85%'],
    bbbRow: '5 × 10 @ 25 kg · 50%',
  },
];

const C3_W1_DAYS: readonly WeekOneDay[] = [
  {
    day: 'Day 1',
    exercise: 'Back Squat',
    main: ['65 kg × 5 · 65%', '75 kg × 5 · 75%', '85 kg × 5+ · 85%'],
    bbbRow: '5 × 10 @ 50 kg · 50%',
  },
  {
    day: 'Day 2',
    exercise: 'Barbell Bench Press',
    main: ['50 kg × 5 · 65%', '57.5 kg × 5 · 75%', '65 kg × 5+ · 85%'],
    bbbRow: '5 × 10 @ 37.5 kg · 50%',
  },
  {
    day: 'Day 3',
    exercise: 'Deadlift',
    main: ['87.5 kg × 5 · 65%', '102.5 kg × 5 · 75%', '115 kg × 5+ · 85%'],
    bbbRow: '5 × 10 @ 67.5 kg · 50%',
  },
  {
    day: 'Day 4',
    exercise: 'Overhead Press',
    main: ['32.5 kg × 5 · 65%', '37.5 kg × 5 · 75%', '42.5 kg × 5+ · 85%'],
    bbbRow: '5 × 10 @ 25 kg · 50%',
  },
];

interface FollowedFiveThreeOne {
  seedCycle(
    tmsKg: Readonly<Record<FiveThreeOneLift, number>>,
    cycle: number,
    script?: FiveThreeOneCycleScript,
  ): Promise<void>;
}

async function followFiveThreeOne(page: Page, prefix: string): Promise<FollowedFiveThreeOne> {
  const username = uniqueUsername(prefix);
  const { accessToken, enrollmentId, bindings } =
    await test.step('follow 5/3/1 BBB at 1RMs squat 100, bench 80, deadlift 140 and press 50', async () => {
      await register(page, username);
      await followProgram(page, FIVE_THREE_ONE, FIVE_THREE_ONE_ONE_RMS_KG);
      const { access_token: accessToken } = await readSession(page);
      const enrollmentId = await activeEnrollmentIdOf(username);
      const { lift_bindings: bindings } = await activeEnrollmentOf(username);
      return { accessToken, enrollmentId, bindings };
    });
  const clock: SessionClock = sessionClock(2 * SESSIONS_PER_CYCLE + 1);
  return {
    async seedCycle(tmsKg, cycle, script) {
      await test.step(`seed cycle ${cycle} at TMs squat ${tmsKg.squat}, bench ${tmsKg.bench}, deadlift ${tmsKg.deadlift} and press ${tmsKg.press}`, async () => {
        await forgetSessionCreateLimits(username);
        await seedProgramDays(accessToken, enrollmentId, bindings, clock, fiveThreeOneBbbCycle(tmsKg, cycle, script));
      });
    },
  };
}

async function expectWeekOne(today: Locator, cycle: number, days: readonly WeekOneDay[]): Promise<void> {
  await expect(dayPicker(today).getByRole('radio', { name: `C${cycle} W1 Day 1`, exact: true })).toBeChecked();
  for (const { day, exercise, main, bbbRow } of days) {
    await test.step(`C${cycle} W1 ${day}: ${exercise} ${main.join(', ')}, BBB ${bbbRow}`, async () => {
      await dayPicker(today)
        .getByRole('radio', { name: `C${cycle} W1 ${day}`, exact: true })
        .click();
      await expect(
        today.getByRole('button', { name: `Start: ${FIVE_THREE_ONE} — C${cycle} W1 ${day}`, exact: true }),
      ).toBeVisible();
      await expect(prescribedRows(today, exercise)).toHaveText(main);
      await expect(prescribedRows(today, `${exercise} — supplemental`)).toHaveText([bbbRow]);
    });
  }
}

test('5/3/1 BBB after a met cycle 1 offers C2 W1 at TMs squat 90 + 5 = 95, bench 72 + 2.5 = 74.5, deadlift 126 + 5 = 131, press 45 + 2.5 = 47.5: squat 61.75 → 62.5, 71.25 → 72.5, 80.75 → 80, BBB 47.5; bench 48.43 → 47.5, 55.88 → 55, 63.33 → 62.5, BBB 37.25 → 37.5; deadlift 85.15 → 85, 98.25 → 97.5, 111.35 → 112.5, BBB 65.5 → 65; press 30.88 → 30, 35.63 → 35, 40.38 → 40, BBB 23.75 → 25', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const program = await followFiveThreeOne(page, 'pf_531');
  await program.seedCycle(CYCLE_1_TMS_KG, 1);

  const today = await test.step('the cycle 1 summary lists every training max change', async () => {
    const programToday = await openProgramToday(page, FIVE_THREE_ONE);
    await expect(cycleSummary(page, 1).getByRole('listitem')).toHaveText([
      'Squat training max 90 → 95 kg',
      'Bench press training max 72 → 74.5 kg',
      'Deadlift training max 126 → 131 kg',
      'Overhead press training max 45 → 47.5 kg',
    ]);
    return programToday;
  });
  await expectWeekOne(today, 2, C2_W1_DAYS);
});

test('5/3/1 BBB after two met cycles offers C3 W1 at TMs squat 95 + 5 = 100, bench 74.5 + 2.5 = 77, deadlift 131 + 5 = 136, press 47.5 + 2.5 = 50: squat 65/75/85, BBB 50; bench 50.05 → 50, 57.75 → 57.5, 65.45 → 65, BBB 38.5 → 37.5; deadlift 88.4 → 87.5, 102 → 102.5, 115.6 → 115, BBB 68 → 67.5; press 32.5/37.5/42.5, BBB 25', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const program = await followFiveThreeOne(page, 'pf_5312');
  await program.seedCycle(CYCLE_1_TMS_KG, 1);
  await program.seedCycle(CYCLE_2_TMS_KG, 2);

  const today = await test.step('the cycle 2 summary lists every training max change', async () => {
    const programToday = await openProgramToday(page, FIVE_THREE_ONE);
    await expect(cycleSummary(page, 2).getByRole('listitem')).toHaveText([
      'Squat training max 95 → 100 kg',
      'Bench press training max 74.5 → 77 kg',
      'Deadlift training max 131 → 136 kg',
      'Overhead press training max 47.5 → 50 kg',
    ]);
    return programToday;
  });
  await expectWeekOne(today, 3, C3_W1_DAYS);
});

test('5/3/1 BBB with a 4-rep C1 W1 squat AMRAP (minimum 5) resets the squat TM to 90 × 0.9 = 81 with no increment: C2 W1 squat 52.65 → 52.5, 60.75 → 60, 68.85 → 70, BBB 40.5 → 40, while bench still goes to 74.5', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const program = await followFiveThreeOne(page, 'pf_531r');
  await program.seedCycle(CYCLE_1_TMS_KG, 1, { amrapReps: { squat: { 1: 4 } } });

  const today = await test.step('the cycle 1 summary lists every training max change', async () => {
    const programToday = await openProgramToday(page, FIVE_THREE_ONE);
    await expect(cycleSummary(page, 1).getByRole('listitem')).toHaveText([
      'Squat training max 90 → 81 kg',
      'Bench press training max 72 → 74.5 kg',
      'Deadlift training max 126 → 131 kg',
      'Overhead press training max 45 → 47.5 kg',
    ]);
    return programToday;
  });
  await expectWeekOne(today, 2, [
    {
      day: 'Day 1',
      exercise: 'Back Squat',
      main: ['52.5 kg × 5 · 65%', '60 kg × 5 · 75%', '70 kg × 5+ · 85%'],
      bbbRow: '5 × 10 @ 40 kg · 50%',
    },
    C2_W1_DAYS[1],
  ]);
});
