import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HISTORY_PAGE_SIZE,
  type HistorySession,
  querySession,
  querySessionPage,
} from '../../web/src/lib/history-rules.ts';
import { createTestUser, db, type TestUser } from './local-stack.ts';

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
