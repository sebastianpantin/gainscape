import { randomUUID } from 'node:crypto';
import { postCompleteSession } from '../../tests/integration/local-stack.ts';
import { exerciseIdOfKey, skipProgramDayElsewhere } from './db.ts';

export type FiveThreeOneLift = 'squat' | 'bench' | 'deadlift' | 'press';

const EXERCISE_KEYS: Readonly<Record<FiveThreeOneLift, string>> = {
  squat: 'back_squat',
  bench: 'barbell_bench_press',
  deadlift: 'deadlift',
  press: 'overhead_press',
};

const MAIN_REPS_BY_WEEK: readonly (readonly number[])[] = [
  [5, 5, 5],
  [3, 3, 3],
  [5, 3, 1],
  [5, 5, 5],
];

const AMRAP_WEEKS: readonly number[] = [1, 2, 3];
const SEEDED_WEIGHT_KG = 60;
const SESSION_MINUTES = 30;
const MINUTE_MS = 60 * 1000;

export interface SeededSession {
  enrollmentId: string;
  week: number;
  lift: FiveThreeOneLift;
  startedAt: Date;
}

async function mainSets(lift: FiveThreeOneLift, week: number) {
  const exerciseId = await exerciseIdOfKey(EXERCISE_KEYS[lift]);
  const reps = MAIN_REPS_BY_WEEK[week - 1];
  return reps.map((setReps, index) => {
    const amrap = index === reps.length - 1 && AMRAP_WEEKS.includes(week);
    return {
      id: randomUUID(),
      exerciseId,
      position: index,
      weightKg: SEEDED_WEIGHT_KG,
      reps: setReps,
      isWarmup: false,
      effort: { type: 'level', level: 'hard' },
      prescription: {
        ref: `${lift}-main:${index}`,
        weightKg: SEEDED_WEIGHT_KG,
        reps: setReps,
        minReps: amrap ? setReps : null,
        amrap,
      },
    };
  });
}

export async function postFiveThreeOneSession(accessToken: string, session: SeededSession): Promise<void> {
  const response = await postCompleteSession(accessToken, {
    id: randomUUID(),
    startedAt: session.startedAt.toISOString(),
    endedAt: new Date(session.startedAt.getTime() + SESSION_MINUTES * MINUTE_MS).toISOString(),
    notes: null,
    program: { enrollmentId: session.enrollmentId, position: { cycle: 1, week: session.week, day: session.lift } },
    sets: await mainSets(session.lift, session.week),
  });
  if (response.status !== 200 || response.body.programLinked !== true)
    throw new Error(`seeding C1 W${session.week} ${session.lift} failed: ${response.status} ${response.rawBody}`);
}

export async function seedFiveThreeOneCycleSkippingPress(accessToken: string, enrollmentId: string): Promise<void> {
  const lifts: readonly FiveThreeOneLift[] = ['squat', 'bench', 'deadlift'];
  const firstStart = Date.now() - (4 * lifts.length + 1) * 60 * MINUTE_MS;
  let started = 0;
  for (const week of [1, 2, 3, 4]) {
    for (const lift of lifts) {
      const startedAt = new Date(firstStart + started * 60 * MINUTE_MS);
      started += 1;
      await postFiveThreeOneSession(accessToken, { enrollmentId, week, lift, startedAt });
    }
    await skipProgramDayElsewhere(enrollmentId, { cycle: 1, week, day: 'press' });
  }
}
