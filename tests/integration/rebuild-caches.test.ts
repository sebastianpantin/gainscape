import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  builtInExerciseId,
  createTestUser,
  db,
  env,
  postCompleteSession,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';

type Effort = { type: 'level'; level: 'hard' | 'near_failure' } | null;

const HOUR_MS = 60 * 60 * 1000;

function workingSet(exerciseId: string, position: number, weightKg: number, reps: number, effort: Effort) {
  return { id: randomUUID(), exerciseId, position, weightKg, reps, isWarmup: false, effort };
}

function sessionStartedHoursAgo(hoursAgo: number, sets: ReturnType<typeof workingSet>[]) {
  const startedAt = new Date(Date.now() - hoursAgo * HOUR_MS);
  return {
    id: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + HOUR_MS / 2).toISOString(),
    sets,
  };
}

async function rebuild(userId: string, bearer = env.SERVICE_ROLE_KEY) {
  const response = await fetch(`${env.FUNCTIONS_URL}/rebuild-caches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  return { status: response.status, body: await response.json() };
}

async function derivedSnapshot(userId: string) {
  return {
    sets: await db`
      select id, rir::float, rir_source, rir_flagged, e1rm_before_kg::float, e1rm_candidate_kg::float,
             reps_capacity_candidate, effective_reps, xp_awarded, effective_load_kg::float
      from public.sets where user_id = ${userId} order by id`,
    setSkillXp:
      await db`select set_id, skill_id, xp from public.set_skill_xp where user_id = ${userId} order by set_id, skill_id`,
    userSkills: await db`select skill_id, xp::int from public.user_skills where user_id = ${userId} order by skill_id`,
    exerciseMaxes: await db`
      select exercise_id, e1rm_kg::float, reps_capacity, source_set_id
      from public.exercise_maxes where user_id = ${userId} order by exercise_id`,
    repMaxes: await db`
      select exercise_id, reps, load_kg::float, set_id, achieved_at, exact_set_id
      from public.rep_maxes where user_id = ${userId} order by exercise_id, reps`,
    bodyweightRepRecords: await db`
      select exercise_id, max_reps, set_id, achieved_at
      from public.bodyweight_rep_records where user_id = ${userId} order by exercise_id`,
  };
}

let lifter: TestUser;
let benchId: string;
let squatId: string;
let pullUpId: string;

beforeAll(async () => {
  [benchId, squatId, pullUpId] = await Promise.all([
    builtInExerciseId('barbell_bench_press'),
    builtInExerciseId('back_squat'),
    builtInExerciseId('pull_up'),
  ]);
  lifter = await createTestUser();
  await setBodyweight(lifter, 80);

  const sessions = [
    sessionStartedHoursAgo(6, [
      workingSet(benchId, 0, 80, 5, { type: 'level', level: 'hard' }),
      workingSet(pullUpId, 1, 0, 8, { type: 'level', level: 'hard' }),
    ]),
    sessionStartedHoursAgo(4, [
      workingSet(benchId, 0, 80, 6, null),
      workingSet(squatId, 1, 100, 5, { type: 'level', level: 'near_failure' }),
    ]),
  ];
  for (const session of sessions) expect((await postCompleteSession(lifter.accessToken, session)).status).toBe(200);

  await setBodyweight(lifter, 85);
  const third = sessionStartedHoursAgo(2, [workingSet(pullUpId, 0, 0, 9, null), workingSet(benchId, 1, 82.5, 5, null)]);
  expect((await postCompleteSession(lifter.accessToken, third)).status).toBe(200);
});

afterAll(async () => {
  await db.end();
});

describe('rebuild-caches', () => {
  it('reproduces exactly what incremental processing stored', async () => {
    const before = await derivedSnapshot(lifter.id);
    const result = await rebuild(lifter.id);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ userId: lifter.id, sessionsReplayed: 3, setsRewritten: 6 });
    expect(await derivedSnapshot(lifter.id)).toEqual(before);
  });

  it('keeps the bodyweight each set was logged with', async () => {
    const rows = await db`
      select st.effective_load_kg::float from public.sets st join public.sessions s on s.id = st.session_id
      where st.user_id = ${lifter.id} and st.exercise_id = ${pullUpId} order by s.started_at`;
    expect(rows.map((row) => row.effective_load_kg)).toEqual([80, 85]);
  });

  it('re-derives legacy default-effort sets', async () => {
    const user = await createTestUser();
    const sessionId = randomUUID();
    const setId = randomUUID();
    const startedAt = new Date(Date.now() - HOUR_MS).toISOString();
    await db.begin(async (tx) => {
      await tx`insert into public.sessions (id, user_id, started_at, ended_at, local_date, timezone, balance_version, derived_balance_version, summary)
               values (${sessionId}, ${user.id}, ${startedAt}, ${startedAt}, current_date, 'UTC', 1, 1, '{}')`;
      await tx`insert into public.sets (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, rir, rir_source, effective_reps, xp_awarded)
               values (${setId}, ${sessionId}, ${user.id}, ${benchId}, 0, 60, 60, 8, 3, 'default', 3, 30)`;
    });
    expect((await rebuild(user.id)).status).toBe(200);
    const [row] = await db`select rir_source, rir, derived_balance_version, balance_version
                           from public.sets st join public.sessions s on s.id = st.session_id where st.id = ${setId}`;
    expect(row).toEqual({ rir_source: 'cold_start', rir: null, derived_balance_version: 2, balance_version: 1 });
    const [{ legacy }] =
      await db`select count(*)::int as legacy from public.sets where rir_source = 'default' and user_id = ${user.id}`;
    expect(legacy).toBe(0);
  });

  it('refuses callers without the service role key', async () => {
    const result = await rebuild(lifter.id, lifter.accessToken);
    expect(result.status).toBe(403);
  });
});
