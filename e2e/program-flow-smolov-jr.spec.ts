import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { readSession, register, uniqueUsername } from './support/app.ts';
import { activeEnrollmentIdOf, activeEnrollmentOf } from './support/db.ts';
import {
  bindExercise,
  dayPicker,
  fillProgramInputs,
  openEnrollForm,
  openProgramToday,
  prescribedRows,
  repeated,
  startFollowing,
} from './support/program-enrollment.ts';
import {
  type SeededDay,
  type SeededSet,
  seedProgramDays,
  sessionClock,
  type SessionClock,
} from './support/program-seed.ts';

const SMOLOV_JR = 'Smolov Jr';
const ONE_RM_KG = 120;
const DAYS_PER_WEEK = 4;
const WEEKS_PER_CYCLE = 3;

interface SmolovDay {
  key: string;
  name: string;
  sets: number;
  reps: number;
  pctLabel: string;
}

const SMOLOV_DAYS: readonly SmolovDay[] = [
  { key: 'mon', name: 'Day 1', sets: 6, reps: 6, pctLabel: '70%' },
  { key: 'wed', name: 'Day 2', sets: 7, reps: 5, pctLabel: '75%' },
  { key: 'fri', name: 'Day 3', sets: 8, reps: 4, pctLabel: '80%' },
  { key: 'sat', name: 'Day 4', sets: 10, reps: 3, pctLabel: '85%' },
];

const WEEK_1_KG = [85, 90, 95, 102.5] as const;
const WEEK_2_KG = [90, 95, 100, 107.5] as const;
const WEEK_3_KG = [92.5, 100, 105, 110] as const;

type WeekLoads = readonly [number, number, number, number];
type MissedLastSetReps = Readonly<Record<string, number>>;

function smolovWeek(week: number, loadsKg: WeekLoads, missed: MissedLastSetReps = {}): SeededDay[] {
  return SMOLOV_DAYS.map((day, dayIndex) => ({
    position: { cycle: 1, week, day: day.key },
    sets: Array.from({ length: day.sets }, (_, index): SeededSet => {
      const set = { lift: 'main', ref: `${day.key}-main:${index}`, weightKg: loadsKg[dayIndex], reps: day.reps };
      const loggedReps = missed[day.key];
      return index === day.sets - 1 && loggedReps !== undefined ? { ...set, loggedReps } : set;
    }),
  }));
}

interface FollowedSmolov {
  seed(days: readonly SeededDay[]): Promise<void>;
}

async function followSmolovJr(page: Page, prefix: string): Promise<FollowedSmolov> {
  return await test.step(`follow Smolov Jr on Back Squat at a 1RM of ${ONE_RM_KG}`, async () => {
    const username = uniqueUsername(prefix);
    await register(page, username);
    await openEnrollForm(page, SMOLOV_JR);
    await fillProgramInputs(page, { 'Main lift 1RM (kg)': ONE_RM_KG });
    await bindExercise(page, 'Main lift', 'Back Squat');
    await startFollowing(page, SMOLOV_JR);
    const { access_token: accessToken } = await readSession(page);
    const enrollmentId = await activeEnrollmentIdOf(username);
    const { lift_bindings: bindings } = await activeEnrollmentOf(username);
    const clock: SessionClock = sessionClock(DAYS_PER_WEEK * WEEKS_PER_CYCLE + 1);
    return {
      async seed(days) {
        await seedProgramDays(accessToken, enrollmentId, bindings, clock, days);
      },
    };
  });
}

async function expectWeek(today: Locator, label: string, loadsKg: WeekLoads): Promise<void> {
  await test.step(`${label} prescribes ${loadsKg.join(', ')} kg`, async () => {
    await expectWeekDays(today, label, loadsKg);
  });
}

async function expectWeekDays(today: Locator, label: string, loadsKg: WeekLoads): Promise<void> {
  await expect(dayPicker(today).getByRole('radio', { name: `${label} Day 1`, exact: true })).toBeChecked();
  for (const [dayIndex, day] of SMOLOV_DAYS.entries()) {
    await dayPicker(today)
      .getByRole('radio', { name: `${label} ${day.name}`, exact: true })
      .click();
    await expect(
      today.getByRole('button', { name: `Start: ${SMOLOV_JR} — ${label} ${day.name}`, exact: true }),
    ).toBeVisible();
    await expect(prescribedRows(today, 'Back Squat')).toHaveText(
      repeated(`${loadsKg[dayIndex]} kg × ${day.reps} · ${day.pctLabel}`, day.sets),
    );
  }
}

test('Smolov Jr has no progression: after a week 1 at a 1RM of 120 with the last Day 4 triple missed (2 reps), week 2 still adds 5 kg to every day: 84 + 5 = 89 → 90, 90 + 5 = 95, 96 + 5 = 101 → 100, 102 + 5 = 107 → 107.5', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const program = await followSmolovJr(page, 'pf_smj');
  await test.step('seed week 1 with the last Day 4 triple missed at 2 reps', async () => {
    await program.seed(smolovWeek(1, WEEK_1_KG, { sat: 2 }));
  });

  await expectWeek(await openProgramToday(page, SMOLOV_JR), 'C1 W2', WEEK_2_KG);
});

test('Smolov Jr week 3 adds the cumulative 8.75 kg to the 1RM 120 percentages: 84 + 8.75 = 92.75 → 92.5, 90 + 8.75 = 98.75 → 100, 96 + 8.75 = 104.75 → 105, 102 + 8.75 = 110.75 → 110; after week 3 cycle 2 restarts at the unchanged week 1 loads 85, 90, 95, 102.5', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const program = await followSmolovJr(page, 'pf_smj3');
  await test.step('seed met weeks 1 and 2', async () => {
    await program.seed([...smolovWeek(1, WEEK_1_KG), ...smolovWeek(2, WEEK_2_KG)]);
  });
  await expectWeek(await openProgramToday(page, SMOLOV_JR), 'C1 W3', WEEK_3_KG);

  await test.step('seed met week 3', async () => {
    await program.seed(smolovWeek(3, WEEK_3_KG));
  });
  await expectWeek(await openProgramToday(page, SMOLOV_JR), 'C2 W1', WEEK_1_KG);
});
