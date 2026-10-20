import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { monthKey } from '../../web/src/lib/ui/date-bucket-rules.ts';
import { queryTrainingDays, trainingSessionOf } from '../../web/src/lib/stats/training-days-rules.ts';
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

describe('training days', () => {
  let owner: TestUser;
  let stranger: TestUser;
  let benchId: string;

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([createTestUser(TIMEZONE), createTestUser(TIMEZONE)]);
    benchId = await builtInExerciseId('barbell_bench_press');
  });

  afterAll(async () => {
    await db.end();
  });

  async function trainingDaysOf(user: TestUser, localDate: string) {
    return await queryTrainingDays(user.client, monthKey(localDate), new AbortController().signal);
  }

  it('sums the working-set volume and reads the XP, records and drops the server stored, through edits and deletes', async () => {
    const [baselineStart, startedAt] = startsOnOneLocalDay(2) as [Date, Date];
    const localDate = localDateOf(startedAt);
    await postSession(owner, payloadAt(baselineStart, [aSet(benchId, 0, 40, { reps: 5 })]));
    const payload = payloadAt(startedAt, [
      aSet(benchId, 0, 40, { isWarmup: true, reps: 8 }),
      aSet(benchId, 1, 60, { reps: 5 }),
      aSet(benchId, 2, 62.5, { reps: 3 }),
    ]);
    await postSession(owner, payload);
    const [stored] = await db`select summary from public.sessions where id = ${payload.id}`;

    const [baseline, ...rows] = await trainingDaysOf(owner, localDate);
    expect(baseline?.volume_kg).toBe(200);
    expect(rows).toEqual([
      {
        local_date: localDate,
        history_only: false,
        xp_by_skill: stored?.summary.xpBySkill,
        pr_count: stored?.summary.prs.length,
        drop_count: stored?.summary.drops.length,
        volume_kg: 487.5,
      },
    ]);
    expect(rows.map(trainingSessionOf)[0]?.xp).toBeGreaterThan(0);
    expect(rows[0]?.pr_count).toBeGreaterThan(0);

    await editSession(owner, payload, [aSet(benchId, 0, 100, { reps: 2 })]);
    expect((await trainingDaysOf(owner, localDate)).map((row) => row.volume_kg)).toEqual([200, 200]);

    expect(await trainingDaysOf(stranger, localDate)).toEqual([]);

    const removed = await postFunction('delete-session', owner.accessToken, { sessionId: payload.id });
    expect(removed.status, removed.rawBody).toBe(200);
    expect(await trainingDaysOf(owner, localDate)).toEqual([baseline]);
  });
});
