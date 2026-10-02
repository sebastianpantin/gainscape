import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, type StrengthHistoryRow, strengthStateAt } from '@domain/index.ts';
import { ageSession, builtInExerciseId, createTestUser, db, type TestUser } from './local-stack.ts';
import { aSet, HOUR_MS, hoursAgo, payloadAt, postSession } from './session-support.ts';

async function storedHistory(userId: string): Promise<StrengthHistoryRow[]> {
  const rows = await db`
    select st.exercise_id, s.id as session_id, s.started_at, st.is_warmup,
           coalesce(st.e1rm_candidate_kg, st.reps_capacity_candidate)::float as candidate
    from public.sets st join public.sessions s on s.id = st.session_id
    where s.user_id = ${userId} and not s.history_only`;
  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    session: { id: row.session_id, startedAt: new Date(row.started_at).toISOString() },
    isWarmup: row.is_warmup,
    strengthCandidate: row.candidate,
  }));
}

async function strengthStateRpc(user: TestUser, asOf: string) {
  const { data, error } = await user.client.rpc('exercise_strength_state', {
    as_of: asOf,
    window_days: DEFAULT_BALANCE.e1rmWindowDays,
  });
  expect(error).toBeNull();
  return Object.fromEntries(
    (data as { exercise_id: string; window_max: number | null; fallback_max: number | null }[]).map((row) => [
      row.exercise_id,
      {
        windowMax: row.window_max === null ? null : Number(row.window_max),
        fallbackMax: row.fallback_max === null ? null : Number(row.fallback_max),
        hasPriorSession: true,
      },
    ]),
  );
}

let lifter: TestUser;
let other: TestUser;
let benchId: string;
let squatId: string;
let curlId: string;
let rowId: string;

beforeAll(async () => {
  [benchId, squatId, curlId, rowId] = await Promise.all([
    builtInExerciseId('barbell_bench_press'),
    builtInExerciseId('back_squat'),
    builtInExerciseId('barbell_curl'),
    builtInExerciseId('barbell_row'),
  ]);
  [lifter, other] = await Promise.all([createTestUser(), createTestUser()]);
  const old = payloadAt(hoursAgo(10), [aSet(squatId, 0, 140), aSet(benchId, 1, 100)]);
  await postSession(lifter, old);
  await ageSession(old.id, '70 days');
  await postSession(
    lifter,
    payloadAt(hoursAgo(5), [
      aSet(benchId, 0, 80),
      aSet(curlId, 1, 20, { reps: 15, effort: { type: 'rir', value: 0 } }),
      aSet(rowId, 2, 40, { reps: 10, isWarmup: true }),
    ]),
  );
  await postSession(other, payloadAt(hoursAgo(3), [aSet(benchId, 0, 200)]));
});

afterAll(async () => {
  await db.end();
});

describe('exercise_strength_state', () => {
  it('matches the domain strength state for a session starting now', async () => {
    const asOf = new Date().toISOString();
    const expected = strengthStateAt(
      await storedHistory(lifter.id),
      { id: randomUUID(), startedAt: asOf },
      DEFAULT_BALANCE,
    );
    expect(await strengthStateRpc(lifter, asOf)).toEqual(expected);
  });

  it('keeps an exercise with only out-of-window strength as a fallback', async () => {
    const state = await strengthStateRpc(lifter, new Date().toISOString());
    expect(state[squatId]).toMatchObject({ windowMax: null });
    expect(state[squatId].fallbackMax).not.toBeNull();
  });

  it('lists a trained exercise that never produced an e1RM', async () => {
    const state = await strengthStateRpc(lifter, new Date().toISOString());
    expect(state[curlId]).toEqual({ windowMax: null, fallbackMax: null, hasPriorSession: true });
  });

  it('leaves out exercises done only as warm-ups', async () => {
    const state = await strengthStateRpc(lifter, new Date().toISOString());
    expect(state[rowId]).toBeUndefined();
  });

  it('ignores sessions at or after the given time', async () => {
    const state = await strengthStateRpc(lifter, new Date(Date.now() - 6 * HOUR_MS).toISOString());
    expect(state[curlId]).toBeUndefined();
  });

  it('shows only the caller their own strength', async () => {
    const state = await strengthStateRpc(other, new Date().toISOString());
    expect(Object.keys(state)).toEqual([benchId]);
  });
});
