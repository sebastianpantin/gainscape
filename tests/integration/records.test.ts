import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  builtInExerciseId,
  createTestUser,
  db,
  type FunctionResponse,
  postCompleteSession,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';

const HOUR_MS = 60 * 60 * 1000;
const hard = { type: 'level', level: 'hard' } as const;

function session(hoursAgo: number, sets: { exerciseId: string; weightKg: number; reps: number }[]) {
  const startedAt = new Date(Date.now() - hoursAgo * HOUR_MS);
  return {
    id: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + HOUR_MS / 2).toISOString(),
    sets: sets.map((set, position) => ({ id: randomUUID(), position, isWarmup: false, effort: hard, ...set })),
  };
}

let lifter: TestUser;
let benchId: string;
let pullUpId: string;
let responses: FunctionResponse[];

beforeAll(async () => {
  [benchId, pullUpId] = await Promise.all([builtInExerciseId('barbell_bench_press'), builtInExerciseId('pull_up')]);
  lifter = await createTestUser();
  await setBodyweight(lifter, 80);
  responses = [];
  for (const workout of [
    session(8, [
      { exerciseId: benchId, weightKg: 90, reps: 5 },
      { exerciseId: pullUpId, weightKg: 0, reps: 8 },
    ]),
    session(5, [
      { exerciseId: benchId, weightKg: 100, reps: 5 },
      { exerciseId: pullUpId, weightKg: 0, reps: 10 },
    ]),
    session(2, [{ exerciseId: benchId, weightKg: 105, reps: 3 }]),
  ]) {
    responses.push(await postCompleteSession(lifter.accessToken, workout));
  }
});

afterAll(async () => {
  await db.end();
});

describe('personal records through complete-session', () => {
  it('reports nothing for the baseline session', () => {
    expect(responses[0].status).toBe(200);
    expect(responses[0].body.prs).toEqual([]);
  });

  it('reports a 5RM and a pull-up rep record in the second session', () => {
    expect(responses[1].body.prs).toEqual([
      { exerciseId: benchId, kind: 'rep_max', reps: 5, loadKg: 100, previousLoadKg: 90, previousReps: null },
      { exerciseId: pullUpId, kind: 'bodyweight_reps', reps: 10, loadKg: null, previousLoadKg: null, previousReps: 8 },
    ]);
  });

  it('reports one 3RM for the heavier triple', () => {
    expect(responses[2].body.prs).toEqual([
      { exerciseId: benchId, kind: 'rep_max', reps: 3, loadKg: 105, previousLoadKg: 100, previousReps: null },
    ]);
  });

  it('stores rep-max slots matching the domain', async () => {
    const rows = await db`select reps, load_kg::float, exact_set_id is not null as exact from public.rep_maxes
                          where user_id = ${lifter.id} and exercise_id = ${benchId} order by reps`;
    expect(rows.map((row) => [row.reps, row.load_kg, row.exact])).toEqual([
      [1, 105, false],
      [2, 105, false],
      [3, 105, true],
      [4, 100, false],
      [5, 100, true],
    ]);
  });

  it('stores the bodyweight rep record', async () => {
    const [row] =
      await db`select max_reps from public.bodyweight_rep_records where user_id = ${lifter.id} and exercise_id = ${pullUpId}`;
    expect(row.max_reps).toBe(10);
  });
});

describe('record tables are read-only for clients', () => {
  it.each(['rep_maxes', 'exercise_maxes', 'bodyweight_rep_records'])('insert into %s is denied', async (table) => {
    const rows: Record<string, object> = {
      rep_maxes: {
        user_id: lifter.id,
        exercise_id: benchId,
        reps: 7,
        load_kg: 500,
        achieved_at: new Date().toISOString(),
      },
      exercise_maxes: { user_id: lifter.id, exercise_id: pullUpId, e1rm_kg: 500 },
      bodyweight_rep_records: {
        user_id: lifter.id,
        exercise_id: benchId,
        max_reps: 99,
        achieved_at: new Date().toISOString(),
      },
    };
    const { error } = await lifter.client.from(table).insert(rows[table]);
    expect(error).not.toBeNull();
  });
});

describe('pinned exercises', () => {
  it('lets a user pin, reorder and unpin their own exercises', async () => {
    const pinned = await lifter.client.from('pinned_exercises').insert({ exercise_id: benchId, position: 0 });
    expect(pinned.error).toBeNull();
    const reordered = await lifter.client.from('pinned_exercises').update({ position: 3 }).eq('exercise_id', benchId);
    expect(reordered.error).toBeNull();
    const { data } = await lifter.client.from('pinned_exercises').select('exercise_id, position');
    expect(data).toEqual([{ exercise_id: benchId, position: 3 }]);
    const unpinned = await lifter.client.from('pinned_exercises').delete().eq('exercise_id', benchId);
    expect(unpinned.error).toBeNull();
  });

  it("refuses pins on someone else's behalf", async () => {
    const other = await createTestUser();
    const { error } = await lifter.client
      .from('pinned_exercises')
      .insert({ user_id: other.id, exercise_id: benchId, position: 0 });
    expect(error).not.toBeNull();
  });

  it("refuses pinning someone else's custom exercise", async () => {
    const owner = await createTestUser();
    const customExerciseId = randomUUID();
    await db.begin(async (tx) => {
      await tx`insert into public.exercises (id, name, load_type, equipment, owner_user_id)
               values (${customExerciseId}, 'Secret Press', 'external', 'machine', ${owner.id})`;
      await tx`insert into public.exercise_skills (exercise_id, skill_id, share_bp)
               select ${customExerciseId}, id, 10000 from public.skills where key = 'chest'`;
    });
    const { error } = await lifter.client
      .from('pinned_exercises')
      .insert({ exercise_id: customExerciseId, position: 0 });
    expect(error).not.toBeNull();
  });
});
