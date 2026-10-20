import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryProgressSets, sessionProgress } from '../../web/src/lib/progress/exercise-progress-rules.ts';
import { builtInExerciseId, createTestUser, db, type TestUser } from './local-stack.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const SERVER_ROW_LIMIT = 1000;
const SETS_PER_SESSION = 200;
const SESSION_COUNT = Math.ceil(SERVER_ROW_LIMIT / SETS_PER_SESSION) + 1;

describe('exercise progress sets', () => {
  let user: TestUser;
  let programUser: TestUser;
  let benchId: string;
  let sessionIds: string[];

  beforeAll(async () => {
    [user, programUser] = await Promise.all([createTestUser(), createTestUser()]);
    benchId = await builtInExerciseId('barbell_bench_press');
    const newest = Date.parse('2026-09-29T12:00:00.000Z');
    const sessions = Array.from({ length: SESSION_COUNT }, (_, index) => {
      const startedAt = new Date(newest - index * DAY_MS).toISOString();
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
    sessionIds = sessions.map((session) => session.id);
    const sets = sessions.flatMap((session) =>
      Array.from({ length: SETS_PER_SESSION }, (_, position) => ({
        id: randomUUID(),
        session_id: session.id,
        user_id: user.id,
        exercise_id: benchId,
        position,
        weight_kg: 60,
        effective_load_kg: 60,
        reps: 5,
        rir: 3,
        rir_source: 'default',
        effective_reps: 3,
        xp_awarded: 10,
      })),
    );
    await db.begin(async (tx) => {
      await tx`insert into public.sessions ${tx(sessions)}`;
      await tx`insert into public.sets ${tx(sets)}`;
    });
    const programSessionId = randomUUID();
    const programStartedAt = '2026-09-29T12:00:00.000Z';
    await db.begin(async (tx) => {
      await tx`insert into public.sessions ${tx({
        id: programSessionId,
        user_id: programUser.id,
        started_at: programStartedAt,
        ended_at: programStartedAt,
        local_date: programStartedAt.slice(0, 10),
        timezone: 'UTC',
        balance_version: 2,
        derived_balance_version: 2,
        summary: tx.json({ xpBySkill: {}, levelUps: [], prs: [], drops: [] }),
      })}`;
      await tx`insert into public.sets ${tx(
        [null, 'w1:d1:bench:0'].map((prescriptionRef, position) => ({
          id: randomUUID(),
          session_id: programSessionId,
          user_id: programUser.id,
          exercise_id: benchId,
          position,
          weight_kg: 60,
          effective_load_kg: 60,
          reps: 5,
          rir: 3,
          rir_source: 'default',
          effective_reps: 3,
          xp_awarded: 10,
          prescription_ref: prescriptionRef,
          prescribed_weight_kg: prescriptionRef === null ? null : 60,
          prescribed_reps: prescriptionRef === null ? null : 5,
          prescribed_amrap: prescriptionRef === null ? null : false,
        })),
      )}`;
    });
  });

  afterAll(async () => {
    await db.end();
  });

  it('reads every set past the server row limit, so the oldest workout stays in the progress', async () => {
    const rows = await queryProgressSets(user.client, benchId, new AbortController().signal);
    expect(rows).toHaveLength(SESSION_COUNT * SETS_PER_SESSION);
    expect(rows.length).toBeGreaterThan(SERVER_ROW_LIMIT);
    const progress = sessionProgress(rows, 'external');
    expect(progress.map((session) => session.sessionId)).toEqual([...sessionIds].reverse());
    expect(progress.at(-1)?.localDate).toBe('2026-09-29');
  });

  it('reads the prescription of each set, so a program-driven workout is told apart', async () => {
    const rows = await queryProgressSets(programUser.client, benchId, new AbortController().signal);
    expect(rows.map((row) => row.prescription_ref).sort()).toEqual([null, 'w1:d1:bench:0'].sort());
    expect(sessionProgress(rows, 'external').map((session) => session.programDriven)).toEqual([true]);
  });
});
