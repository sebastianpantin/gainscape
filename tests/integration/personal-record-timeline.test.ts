import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRecordTimeline, type RecordTimelineRow } from '../../web/src/lib/stats/pr-timeline-rules.ts';
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

describe('personal record timeline', () => {
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

  async function timelineOf(user: TestUser): Promise<RecordTimelineRow[]> {
    return await queryRecordTimeline(user.client, null, new AbortController().signal);
  }

  async function storedRecords(sessionId: string): Promise<unknown[]> {
    const [stored] = await db`select summary from public.sessions where id = ${sessionId}`;
    return stored?.summary.prs;
  }

  it('lists the records the server stored, newest workout first, through edits and deletes', async () => {
    const [baselineStart, firstStart, secondStart] = startsOnOneLocalDay(3) as [Date, Date, Date];
    await postSession(owner, payloadAt(baselineStart, [aSet(benchId, 0, 40, { reps: 5 })]));
    const first = payloadAt(firstStart, [aSet(benchId, 0, 60, { reps: 5 })]);
    const second = payloadAt(secondStart, [aSet(benchId, 0, 80, { reps: 5 })]);
    await postSession(owner, first);
    await postSession(owner, second);

    expect((await storedRecords(first.id)).length).toBeGreaterThan(0);
    const timeline = await timelineOf(owner);
    expect(timeline.map((row) => row.session_id)).toEqual([
      ...(await storedRecords(second.id)).map(() => second.id),
      ...(await storedRecords(first.id)).map(() => first.id),
    ]);
    expect(timeline[0]).toEqual({
      session_id: second.id,
      started_at: expect.any(String),
      local_date: localDateOf(secondStart),
      record: (await storedRecords(second.id))[0],
    });
    expect(Date.parse(timeline[0]!.started_at)).toBe(secondStart.getTime());
    expect(timeline[0]?.record).toMatchObject({ kind: 'rep_max', loadKg: 80, previousLoadKg: 60 });

    expect(await timelineOf(stranger)).toEqual([]);

    await editSession(owner, second, [aSet(benchId, 0, 40, { reps: 5 })]);
    expect(await storedRecords(second.id)).toEqual([]);
    expect(new Set((await timelineOf(owner)).map((row) => row.session_id))).toEqual(new Set([first.id]));

    const removed = await postFunction('delete-session', owner.accessToken, { sessionId: first.id });
    expect(removed.status, removed.rawBody).toBe(200);
    const afterDelete = await timelineOf(owner);
    const remaining = await storedRecords(second.id);
    expect(afterDelete.map((row) => row.record)).toEqual(remaining);
    expect(afterDelete.map((row) => row.session_id)).toEqual(remaining.map(() => second.id));
  });
});
