import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '@domain/index.ts';
import { builtInExerciseId, createTestUser, db, rebuildCaches, type TestUser } from './local-stack.ts';
import { editSession, hard, type SetShape } from './session-support.ts';

const SESSION_COUNT = 250;
const MINUTES_BETWEEN_SESSIONS = 4;
const FIRST_SESSION_DAYS_AGO = 6.5;
const REBUILD_BUDGET_MS = 5_000;
const EDIT_BUDGET_MS = 5_000;
const SELF_HEALING_EDIT_BUDGET_MS = 10_000;
const BENCHMARK_TIMEOUT_MS = 60_000;

let benchId: string;
let squatId: string;

beforeAll(async () => {
  [benchId, squatId] = await Promise.all([builtInExerciseId('barbell_bench_press'), builtInExerciseId('back_squat')]);
});

afterAll(async () => {
  await db.end();
});

async function seedStaleSessionsInsideEditWindow(userId: string): Promise<void> {
  await db.begin(async (tx) => {
    await tx`
      insert into public.sessions
        (id, user_id, started_at, ended_at, local_date, timezone, balance_version, derived_balance_version, summary)
      select gen_random_uuid(), ${userId}, started_at, started_at + interval '3 minutes',
             (started_at at time zone 'UTC')::date, 'UTC', ${DEFAULT_BALANCE.version}, ${DEFAULT_BALANCE.version - 1},
             '{}'::jsonb
      from (
        select date_trunc('milliseconds', now() - make_interval(mins => ${FIRST_SESSION_DAYS_AGO * 24 * 60}))
               + make_interval(mins => ordinal * ${MINUTES_BETWEEN_SESSIONS}) as started_at
        from generate_series(0, ${SESSION_COUNT - 1}) as ordinal
      ) as planned`;
    await tx`
      insert into public.sets
        (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps,
         effort_input_type, effort_value, rir_source, effective_reps, xp_awarded)
      select gen_random_uuid(), ordered.id, ${userId}, lift.exercise_id, lift.position,
             60 + (ordered.ordinal % 40) * 1.25, 60 + (ordered.ordinal % 40) * 1.25, 5,
             'rir', 2, 'logged', 0, 0
      from (
        select id, row_number() over (order by started_at) as ordinal
        from public.sessions where user_id = ${userId}
      ) as ordered
      cross join (values (${benchId}::uuid, 0), (${squatId}::uuid, 1), (${benchId}::uuid, 2), (${squatId}::uuid, 3))
        as lift (exercise_id, position)`;
  });
}

async function earliestSession(userId: string) {
  const [session] = await db`
    select id from public.sessions where user_id = ${userId} order by started_at limit 1`;
  const sets = await db`
    select id, exercise_id, position, weight_kg::float from public.sets
    where session_id = ${session.id} order by position`;
  return { id: session.id as string, sets };
}

async function timeEditOfEarliestSession(user: TestUser, extraKg: number) {
  const earliest = await earliestSession(user.id);
  const heavier: SetShape[] = earliest.sets.map((set) => ({
    id: set.id,
    exerciseId: set.exercise_id,
    position: set.position,
    weightKg: set.weight_kg + extraKg,
    reps: 5,
    isWarmup: false,
    effort: hard,
  }));
  const [{ revision }] = await db`select revision from public.sessions where id = ${earliest.id}`;
  const started = performance.now();
  const response = await editSession(user, earliest, heavier, revision);
  return { elapsedMs: performance.now() - started, replayed: response.body.replayedSessionIds?.length };
}

async function timeRebuild(userId: string) {
  const started = performance.now();
  const response = await rebuildCaches(userId);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return performance.now() - started;
}

describe('replay at scale', () => {
  it(
    `rebuilds and replays ${SESSION_COUNT} sessions after an edit to the earliest one within budget`,
    async () => {
      const user = await createTestUser();
      await seedStaleSessionsInsideEditWindow(user.id);

      const rebuildMs = await timeRebuild(user.id);
      const edit = await timeEditOfEarliestSession(user, 2.5);
      await db`update public.sessions set derived_balance_version = ${DEFAULT_BALANCE.version - 1} where user_id = ${user.id}`;
      const selfHealingEdit = await timeEditOfEarliestSession(user, 5);

      console.info(
        `replay scale ${SESSION_COUNT} sessions: rebuild ${Math.round(rebuildMs)} ms, ` +
          `edit ${Math.round(edit.elapsedMs)} ms, self-healing edit ${Math.round(selfHealingEdit.elapsedMs)} ms`,
      );
      expect([edit.replayed, selfHealingEdit.replayed]).toEqual([SESSION_COUNT, SESSION_COUNT]);
      expect(rebuildMs).toBeLessThan(REBUILD_BUDGET_MS);
      expect(edit.elapsedMs).toBeLessThan(EDIT_BUDGET_MS);
      expect(selfHealingEdit.elapsedMs).toBeLessThan(SELF_HEALING_EDIT_BUDGET_MS);
    },
    BENCHMARK_TIMEOUT_MS,
  );
});
