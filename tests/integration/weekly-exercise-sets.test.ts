import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryWeeklyExerciseSets } from '../../web/src/lib/stats/volume-history-rules.ts';
import { weekKey } from '../../web/src/lib/ui/date-bucket-rules.ts';
import { builtInExerciseId, createTestUser, db, postFunction, type TestUser } from './local-stack.ts';
import {
  aSet,
  editSession,
  localDateOf,
  payloadAt,
  postSession,
  startsOnOneLocalDay,
  TIMEZONE,
} from './session-support.ts';

describe('weekly exercise sets', () => {
  let owner: TestUser;
  let stranger: TestUser;
  let benchId: string;
  let squatId: string;

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([createTestUser(TIMEZONE), createTestUser(TIMEZONE)]);
    [benchId, squatId] = await Promise.all([builtInExerciseId('barbell_bench_press'), builtInExerciseId('back_squat')]);
  });

  afterAll(async () => {
    await db.end();
  });

  async function weeklySetsOf(user: TestUser) {
    return await queryWeeklyExerciseSets(user.client, new AbortController().signal);
  }

  it('counts the working sets of this week per exercise through edits and deletes', async () => {
    const [startedAt] = startsOnOneLocalDay(1) as [Date];
    const weekStart = weekKey(localDateOf(startedAt));
    const payload = payloadAt(startedAt, [
      aSet(benchId, 0, 40, { isWarmup: true, reps: 8 }),
      aSet(benchId, 1, 60, { reps: 5 }),
      aSet(benchId, 2, 62.5, { reps: 3 }),
      aSet(squatId, 3, 100, { reps: 5 }),
    ]);
    await postSession(owner, payload);

    const bySets = (rows: { exercise_id: string; sets: number }[]) =>
      Object.fromEntries(rows.map((row) => [row.exercise_id, row.sets]));
    const rows = await weeklySetsOf(owner);
    expect(rows.every((row) => row.week_start === weekStart)).toBe(true);
    expect(bySets(rows)).toEqual({ [benchId]: 2, [squatId]: 1 });

    await editSession(owner, payload, [aSet(benchId, 0, 100, { reps: 2 })]);
    expect(bySets(await weeklySetsOf(owner))).toEqual({ [benchId]: 1 });

    expect(await weeklySetsOf(stranger)).toEqual([]);

    const removed = await postFunction('delete-session', owner.accessToken, { sessionId: payload.id });
    expect(removed.status, removed.rawBody).toBe(200);
    expect(await weeklySetsOf(owner)).toEqual([]);
  });
});
