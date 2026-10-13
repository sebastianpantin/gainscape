import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HISTORY_PAGE_SIZE,
  type HistorySession,
  querySession,
  querySessionPage,
} from '../../web/src/lib/history/history-rules.ts';
import { builtInExerciseId, createTestUser, db, type TestUser } from './local-stack.ts';

const SESSION_COUNT = HISTORY_PAGE_SIZE + 7;
const MINUTE_MS = 60 * 1000;
const TIED_POSITIONS = [HISTORY_PAGE_SIZE - 1, HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE + 1];

function startedAtFor(position: number, base: number): string {
  if (!TIED_POSITIONS.includes(position)) return new Date(base - position * MINUTE_MS).toISOString();
  return new Date(base - TIED_POSITIONS[0] * MINUTE_MS).toISOString();
}

describe('history keyset paging', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
    const base = Date.parse('2026-09-29T12:00:00.000Z');
    const rows = Array.from({ length: SESSION_COUNT }, (_, index) => {
      const startedAt = startedAtFor(index, base);
      return {
        id: randomUUID(),
        user_id: user.id,
        started_at: startedAt,
        ended_at: startedAt,
        local_date: startedAt.slice(0, 10),
        timezone: 'UTC',
        balance_version: 2,
        derived_balance_version: 2,
        summary: db.json({ xpBySkill: {}, levelUps: [], prs: [], drops: [] }),
      };
    });
    await db`insert into public.sessions ${db(rows)}`;
    const tiedIds = TIED_POSITIONS.map((position) => rows[position].id);
    await db`
      update public.sessions set started_at = started_at + interval '123456 microseconds', ended_at = ended_at + interval '1 second'
      where id = any(${tiedIds}::uuid[])`;
  });

  it('walks every session exactly once, in order, when sessions sharing a start time straddle a page boundary', async () => {
    const seen: HistorySession[] = [];
    let pages = 0;
    for (;;) {
      const page = await querySessionPage(user.client, seen.at(-1) ?? null);
      pages++;
      seen.push(...page);
      if (page.length < HISTORY_PAGE_SIZE) break;
    }

    const expected = await db`
      select id from public.sessions where user_id = ${user.id} order by started_at desc, id desc`;
    const ids = seen.map((session) => session.id);
    expect(pages).toBe(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expected.map((row) => row.id));
    expect(ids).toHaveLength(SESSION_COUNT);

    const tied = seen.slice(TIED_POSITIONS[0], TIED_POSITIONS.at(-1)! + 1).map((session) => session.startedAt);
    expect(new Set(tied).size).toBe(1);
    expect(tied[0]).toContain('.123456');
  });

  it('reads the start, finish and session RPE of a workout', async () => {
    const [newest] = await db`
      update public.sessions set session_rpe = 7, ended_at = started_at + interval '48 minutes'
      where id = (select id from public.sessions where user_id = ${user.id} order by started_at desc, id desc limit 1)
      returning id, started_at, ended_at`;
    const session = await querySession(user.client, newest.id);
    expect(session).toMatchObject({ sessionRpe: 7 });
    expect(Date.parse(session!.endedAt) - Date.parse(session!.startedAt)).toBe(48 * MINUTE_MS);
    expect((await querySessionPage(user.client, null))[0]).toMatchObject({ id: newest.id, sessionRpe: 7 });
  });
});

describe('history overview sets', () => {
  it('reads each set with its exercise name, so a card can name the exercises and total the volume', async () => {
    const owner = await createTestUser();
    const [benchId, squatId] = await Promise.all([
      builtInExerciseId('barbell_bench_press'),
      builtInExerciseId('back_squat'),
    ]);
    const startedAt = '2026-09-30T08:00:00.000Z';
    const sessionId = randomUUID();
    const setFor = (exerciseId: string, position: number, loadKg: number, isWarmup: boolean) => ({
      id: randomUUID(),
      session_id: sessionId,
      user_id: owner.id,
      exercise_id: exerciseId,
      position,
      weight_kg: loadKg,
      effective_load_kg: loadKg,
      reps: 5,
      is_warmup: isWarmup,
      rir: 3,
      rir_source: 'default',
      effective_reps: 3,
      xp_awarded: 10,
    });
    await db.begin(async (tx) => {
      await tx`insert into public.sessions ${tx({
        id: sessionId,
        user_id: owner.id,
        started_at: startedAt,
        ended_at: startedAt,
        local_date: startedAt.slice(0, 10),
        timezone: 'UTC',
        balance_version: 2,
        derived_balance_version: 2,
        summary: tx.json({ xpBySkill: {}, levelUps: [], prs: [], drops: [] }),
      })}`;
      await tx`insert into public.sets ${tx([setFor(squatId, 0, 60, true), setFor(squatId, 1, 100, false), setFor(benchId, 2, 80.5, false)])}`;
    });

    const [session] = await querySessionPage(owner.client, null);

    expect(session.setCount).toBe(3);
    expect([...session.overviewSets].sort((a, b) => a.position - b.position)).toEqual([
      { exerciseName: 'Back Squat', position: 0, effectiveLoadKg: 60, reps: 5, isWarmup: true },
      { exerciseName: 'Back Squat', position: 1, effectiveLoadKg: 100, reps: 5, isWarmup: false },
      { exerciseName: 'Barbell Bench Press', position: 2, effectiveLoadKg: 80.5, reps: 5, isWarmup: false },
    ]);
  });
});
