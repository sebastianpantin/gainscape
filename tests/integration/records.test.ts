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
import { aBout, aSet, hoursAgo, payloadAt, type SessionPayload } from './session-support.ts';

let lifter: TestUser;
let benchId: string;
let pullUpId: string;
let responses: FunctionResponse[];
let workouts: SessionPayload[];

beforeAll(async () => {
  [benchId, pullUpId] = await Promise.all([builtInExerciseId('barbell_bench_press'), builtInExerciseId('pull_up')]);
  lifter = await createTestUser();
  await setBodyweight(lifter, 80);
  responses = [];
  workouts = [];
  for (const workout of [
    payloadAt(hoursAgo(8), [aSet(benchId, 0, 90, { reps: 5 }), aSet(pullUpId, 1, 0, { reps: 8 })]),
    payloadAt(hoursAgo(5), [aSet(benchId, 0, 100, { reps: 5 }), aSet(pullUpId, 1, 0, { reps: 10 })]),
    payloadAt(hoursAgo(2), [aSet(benchId, 0, 105, { reps: 3 })]),
  ]) {
    workouts.push(workout);
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
    const [bench, pullUp] = workouts[1].sets;
    expect(responses[1].body.prs).toEqual([
      {
        exerciseId: benchId,
        kind: 'rep_max',
        setId: bench.id,
        reps: 5,
        loadKg: 100,
        previousLoadKg: 90,
        previousReps: null,
      },
      {
        exerciseId: pullUpId,
        kind: 'bodyweight_reps',
        setId: pullUp.id,
        reps: 10,
        loadKg: null,
        previousLoadKg: null,
        previousReps: 8,
      },
    ]);
  });

  it('reports one 3RM for the heavier triple', () => {
    expect(responses[2].body.prs).toEqual([
      {
        exerciseId: benchId,
        kind: 'rep_max',
        setId: workouts[2].sets[0].id,
        reps: 3,
        loadKg: 105,
        previousLoadKg: 100,
        previousReps: null,
      },
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

describe('cardio records through complete-session', () => {
  let runner: TestUser;
  let runId: string;
  let firstRun: ReturnType<typeof payloadAt>;
  let longerRun: ReturnType<typeof payloadAt>;
  let cardioResponses: FunctionResponse[];

  beforeAll(async () => {
    runId = await builtInExerciseId('running');
    runner = await createTestUser();
    firstRun = payloadAt(hoursAgo(8), [aBout(runId, 0, { durationS: 1800, distanceM: 5000 })]);
    longerRun = payloadAt(hoursAgo(4), [aBout(runId, 0, { durationS: 2160, distanceM: 6000 })]);
    cardioResponses = [];
    for (const payload of [firstRun, longerRun])
      cardioResponses.push(await postCompleteSession(runner.accessToken, payload));
  });

  it('reports nothing for the first run', () => {
    expect(cardioResponses[0].status).toBe(200);
    expect(cardioResponses[0].body.prs).toEqual([]);
  });

  it('reports the longer run as one cardio record naming its bout', () => {
    expect(cardioResponses[1].body.prs).toEqual([
      {
        kind: 'cardio',
        exerciseId: runId,
        setId: longerRun.sets[0].id,
        records: [
          { kind: 'distance', value: 6000, previous: 5000 },
          { kind: 'duration', value: 2160, previous: 1800 },
        ],
      },
    ]);
  });

  it('stores the cardio records the domain derives', async () => {
    const rows = await db`
      select kind, value::float, set_id from public.cardio_records
      where user_id = ${runner.id} and exercise_id = ${runId} order by kind`;
    expect(rows.map((row) => [row.kind, row.value, row.set_id])).toEqual([
      ['distance', 6000, longerRun.sets[0].id],
      ['pace', 360, firstRun.sets[0].id],
      ['duration', 2160, longerRun.sets[0].id],
    ]);
  });

  it('lets the owner read their cardio records and nobody else', async () => {
    const own = await runner.client.from('cardio_records').select('kind');
    expect(own.data).toHaveLength(3);
    const other = await lifter.client.from('cardio_records').select('kind').eq('user_id', runner.id);
    expect(other.data).toEqual([]);
  });
});

describe('record tables are read-only for clients', () => {
  it.each(['rep_maxes', 'exercise_maxes', 'bodyweight_rep_records', 'cardio_records'])(
    'insert into %s is denied',
    async (table) => {
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
        cardio_records: {
          user_id: lifter.id,
          exercise_id: benchId,
          kind: 'distance',
          value: 99_000,
          achieved_at: new Date().toISOString(),
        },
      };
      const { error } = await lifter.client.from(table).insert(rows[table]);
      expect(error).not.toBeNull();
    },
  );
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
