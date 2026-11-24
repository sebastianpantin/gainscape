import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryReviewContext } from '../../web/src/lib/garmin/review-context-rules.ts';
import { importAs, imported, seenBy, sessionsOf, totalXp, wholeSecondAgo } from './garmin-import-support.ts';
import { builtInExerciseId, createTestUser, db, type TestUser } from './local-stack.ts';
import { aSet, DAY_MS, HOUR_MS, payloadAt, postSession } from './session-support.ts';

interface LiftSetBody {
  exerciseId: string;
  reps: number;
  weightKg: number;
}

interface PickBody {
  category: string;
  exerciseId: string;
}

interface StrengthBody {
  startedAt: string;
  garminType: string | null;
  durationS: number;
  sets: LiftSetBody[];
  picks: PickBody[];
}

let benchId: string;
let rowId: string;
let pushUpId: string;
let weightedPullUpId: string;
let runningId: string;

beforeAll(async () => {
  [benchId, rowId, pushUpId, weightedPullUpId, runningId] = await Promise.all([
    builtInExerciseId('barbell_bench_press'),
    builtInExerciseId('barbell_row'),
    builtInExerciseId('push_up'),
    builtInExerciseId('weighted_pull_up'),
    builtInExerciseId('running'),
  ]);
});

afterAll(async () => {
  await db.end();
});

function aStrengthActivity(startedAt: string, overrides: Partial<StrengthBody> = {}): StrengthBody {
  return {
    startedAt,
    garminType: 'strength_training',
    durationS: 3000,
    sets: [
      { exerciseId: benchId, reps: 8, weightKg: 60 },
      { exerciseId: benchId, reps: 6, weightKg: 62.5 },
      { exerciseId: rowId, reps: 10, weightKg: 40 },
    ],
    picks: [
      { category: 'bench_press', exerciseId: benchId },
      { category: 'row', exerciseId: rowId },
    ],
    ...overrides,
  };
}

async function setsOfSession(sessionId: string) {
  return await db`
    select exercise_id, position, reps, weight_kg::float, is_warmup, effort_input_type, effort_value, prescription_ref,
           duration_s
    from public.sets where session_id = ${sessionId} order by position`;
}

async function withBodyweight(user: TestUser): Promise<TestUser> {
  const saved = await user.client.from('profile_private').update({ bodyweight_kg: 82 }).eq('user_id', user.id);
  expect(saved.error).toBeNull();
  return user;
}

async function picksOf(user: TestUser): Promise<Record<string, string>> {
  const rows = await db`
    select category, exercise_id from public.garmin_exercise_picks where user_id = ${user.id} order by category`;
  return Object.fromEntries(rows.map((row) => [row.category as string, row.exercise_id as string]));
}

describe('import-activities with a strength activity', () => {
  it('stores it as one Session with its Lift sets in order, no Effort, no warmup, and remembers it', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(3 * HOUR_MS);
    const [outcome] = await imported(user, [aStrengthActivity(startedAt)]);

    expect(outcome).toEqual({ startedAt, outcome: 'imported', sessionId: expect.any(String), xp: expect.any(Number) });
    expect(outcome.xp).toBe(await totalXp(user.id));
    expect(outcome.xp).toBeGreaterThan(0);
    expect(await seenBy(user.id)).toEqual([
      { startedAt, outcome: 'imported', sessionId: outcome.sessionId, garminType: 'strength_training' },
    ]);
    const [session] = await sessionsOf(user.id);
    expect(session).toMatchObject({ id: outcome.sessionId, history_only: false, notes: null, session_rpe: null });
    expect(new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()).toBe(3000 * 1000);
    const unmarked = {
      is_warmup: false,
      effort_input_type: null,
      effort_value: null,
      prescription_ref: null,
      duration_s: null,
    };
    expect(await setsOfSession(outcome.sessionId!)).toEqual([
      { exercise_id: benchId, position: 0, reps: 8, weight_kg: 60, ...unmarked },
      { exercise_id: benchId, position: 1, reps: 6, weight_kg: 62.5, ...unmarked },
      { exercise_id: rowId, position: 2, reps: 10, weight_kg: 40, ...unmarked },
    ]);
  });

  it('earns by the normal rules: the same XP and Records as the same sets logged by hand without Effort', async () => {
    const [importer, logger] = await Promise.all([createTestUser(), createTestUser()]);
    const lighter = aStrengthActivity(wholeSecondAgo(30 * HOUR_MS));
    const heavier = aStrengthActivity(wholeSecondAgo(4 * HOUR_MS), {
      sets: [
        { exerciseId: benchId, reps: 8, weightKg: 70 },
        { exerciseId: rowId, reps: 10, weightKg: 50 },
      ],
    });

    const logged = [];
    for (const activity of [lighter, heavier]) {
      const sets = activity.sets.map((set, position) =>
        aSet(set.exerciseId, position, set.weightKg, { reps: set.reps, effort: null }),
      );
      logged.push(await postSession(logger, payloadAt(new Date(activity.startedAt), sets)));
    }
    const outcomes = await imported(importer, [lighter, heavier]);

    expect(outcomes.map((outcome) => outcome.xp)).toEqual(
      logged.map((response) => Object.values(response.body.xpBySkill!).reduce((sum, xp) => sum + xp, 0)),
    );
    expect(outcomes[0].xp).toBeGreaterThan(0);
    const recordedExercises = async (userId: string) => {
      const [, second] = await sessionsOf(userId);
      return second.summary.prs.map((pr: { exerciseId: string }) => pr.exerciseId);
    };
    expect(await recordedExercises(importer.id)).toEqual(await recordedExercises(logger.id));
    expect(await recordedExercises(importer.id)).toEqual(expect.arrayContaining([benchId, rowId]));
  });

  it('stores one older than 7 days as history only, which earns nothing', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(10 * DAY_MS);
    const [outcome] = await imported(user, [aStrengthActivity(startedAt)]);

    expect(outcome).toEqual({ startedAt, outcome: 'history_only', sessionId: expect.any(String) });
    expect(await totalXp(user.id)).toBe(0);
    expect(await setsOfSession(outcome.sessionId!)).toHaveLength(3);
  });

  it('takes an added weight on a bodyweight exercise that allows one, and a bodyweight set without weight', async () => {
    const user = await withBodyweight(await createTestUser());
    const [outcome] = await imported(user, [
      aStrengthActivity(wholeSecondAgo(3 * HOUR_MS), {
        sets: [
          { exerciseId: weightedPullUpId, reps: 5, weightKg: 12.5 },
          { exerciseId: weightedPullUpId, reps: 5, weightKg: 0 },
          { exerciseId: pushUpId, reps: 20, weightKg: 0 },
        ],
        picks: [],
      }),
    ]);
    expect(outcome.outcome).toBe('imported');
    expect((await setsOfSession(outcome.sessionId!)).map((set) => set.weight_kg)).toEqual([12.5, 0, 0]);
  });

  it('skips the second import of the same strength activity and changes nothing', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(3 * HOUR_MS);
    await imported(user, [aStrengthActivity(startedAt)]);
    const xpBefore = await totalXp(user.id);
    const [again] = await imported(user, [
      aStrengthActivity(startedAt, { picks: [{ category: 'bench_press', exerciseId: rowId }] }),
    ]);

    expect(again).toEqual({ startedAt, outcome: 'skipped', reason: 'already_imported' });
    expect(await sessionsOf(user.id)).toHaveLength(1);
    expect(await totalXp(user.id)).toBe(xpBefore);
    expect(await picksOf(user)).toEqual({ bench_press: benchId, row: rowId });
  });

  it('remembers the picks of an imported activity and replaces them on a later one', async () => {
    const user = await withBodyweight(await createTestUser());
    await imported(user, [aStrengthActivity(wholeSecondAgo(30 * HOUR_MS))]);
    expect(await picksOf(user)).toEqual({ bench_press: benchId, row: rowId });

    await imported(user, [
      aStrengthActivity(wholeSecondAgo(3 * HOUR_MS), {
        sets: [
          { exerciseId: pushUpId, reps: 20, weightKg: 0 },
          { exerciseId: weightedPullUpId, reps: 5, weightKg: 10 },
        ],
        picks: [
          { category: 'bench_press', exerciseId: pushUpId },
          { category: 'pull_up', exerciseId: weightedPullUpId },
        ],
      }),
    ]);
    expect(await picksOf(user)).toEqual({ bench_press: pushUpId, pull_up: weightedPullUpId, row: rowId });
  });

  it('remembers the pick of the latest activity when one chunk picks twice for a category', async () => {
    const user = await withBodyweight(await createTestUser());
    const older = aStrengthActivity(wholeSecondAgo(20 * DAY_MS), {
      sets: [{ exerciseId: pushUpId, reps: 20, weightKg: 0 }],
      picks: [{ category: 'bench_press', exerciseId: pushUpId }],
    });
    const newer = aStrengthActivity(wholeSecondAgo(15 * DAY_MS), {
      sets: [{ exerciseId: benchId, reps: 8, weightKg: 60 }],
      picks: [{ category: 'bench_press', exerciseId: benchId }],
    });
    await imported(user, [newer, older]);
    expect(await picksOf(user)).toEqual({ bench_press: benchId });
  });

  it('lets the Import review read the remembered picks of the caller only', async () => {
    const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    await imported(owner, [aStrengthActivity(wholeSecondAgo(3 * HOUR_MS))]);

    const ownContext = await queryReviewContext(owner.client, null);
    expect(Object.fromEntries(ownContext.exerciseIdByGarminCategory)).toEqual({ bench_press: benchId, row: rowId });
    expect((await queryReviewContext(stranger.client, null)).exerciseIdByGarminCategory.size).toBe(0);
  });

  it('imports a Cardio and a strength activity in one chunk', async () => {
    const user = await createTestUser();
    const run = {
      startedAt: wholeSecondAgo(20 * HOUR_MS),
      garminType: 'running',
      exerciseId: runningId,
      durationS: 1800,
      distanceM: 5000,
      interval: null,
    };
    const outcomes = await imported(user, [aStrengthActivity(wholeSecondAgo(3 * HOUR_MS)), run]);
    expect(outcomes.map((outcome) => outcome.outcome)).toEqual(['imported', 'imported']);
    expect(await sessionsOf(user.id)).toHaveLength(2);
  });

  it('takes a chunk at the scoring limit: 10 strength activities of 25 sets, young enough to score', async () => {
    const user = await createTestUser();
    const activities = Array.from({ length: 10 }, (_, index) =>
      aStrengthActivity(wholeSecondAgo((2 + index * 12) * HOUR_MS), {
        sets: Array.from({ length: 25 }, (_unused, set) => ({
          exerciseId: set < 13 ? benchId : rowId,
          reps: 5 + (set % 4),
          weightKg: 60 + index * 2.5,
        })),
      }),
    );
    const outcomes = await imported(user, activities);

    expect(outcomes.map((outcome) => outcome.outcome)).toEqual(activities.map(() => 'imported'));
    const [{ count }] = await db`select count(*)::int as count from public.sets where user_id = ${user.id}`;
    expect(count).toBe(250);
  });

  it.each<[string, (startedAt: string) => unknown]>([
    ['no sets', (startedAt) => aStrengthActivity(startedAt, { sets: [], picks: [] })],
    [
      'more sets than a Session allows',
      (startedAt) =>
        aStrengthActivity(startedAt, {
          sets: Array.from({ length: 201 }, () => ({ exerciseId: benchId, reps: 5, weightKg: 60 })),
        }),
    ],
    [
      'a set without reps',
      (startedAt) => aStrengthActivity(startedAt, { sets: [{ exerciseId: benchId, reps: 0, weightKg: 60 }] }),
    ],
    [
      'a pick for an exercise none of its sets has',
      (startedAt) => aStrengthActivity(startedAt, { picks: [{ category: 'curl', exerciseId: pushUpId }] }),
    ],
    [
      'a pick for the unknown category',
      (startedAt) => aStrengthActivity(startedAt, { picks: [{ category: 'unknown', exerciseId: benchId }] }),
    ],
    [
      'a category that is no Garmin key',
      (startedAt) => aStrengthActivity(startedAt, { picks: [{ category: 'Bench Press', exerciseId: benchId }] }),
    ],
    [
      'an exercise of its own beside the sets',
      (startedAt) => ({ ...aStrengthActivity(startedAt), exerciseId: benchId }),
    ],
    ['a distance', (startedAt) => ({ ...aStrengthActivity(startedAt), distanceM: 5000 })],
    ['a longer duration than a workout may have', (startedAt) => aStrengthActivity(startedAt, { durationS: 43_201 })],
  ])('refuses a strength activity with %s and stores nothing', async (_what, activityAt) => {
    const user = await createTestUser();
    const response = await importAs(user, [activityAt(wholeSecondAgo(3 * HOUR_MS))]);
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe('invalid_payload');
    expect(await sessionsOf(user.id)).toEqual([]);
    expect(await picksOf(user)).toEqual({});
  });

  it('refuses an exercise that is no Lift exercise, as complete-session does, and stores nothing', async () => {
    const user = await createTestUser();
    const response = await importAs(user, [
      aStrengthActivity(wholeSecondAgo(3 * HOUR_MS), {
        sets: [{ exerciseId: runningId, reps: 5, weightKg: 60 }],
        picks: [],
      }),
    ]);
    expect(response.status, response.rawBody).toBe(422);
    expect(await sessionsOf(user.id)).toEqual([]);
    expect(await seenBy(user.id)).toEqual([]);
  });

  it('refuses a bodyweight exercise while the user has no bodyweight, as complete-session does', async () => {
    const user = await createTestUser();
    const response = await importAs(user, [
      aStrengthActivity(wholeSecondAgo(3 * HOUR_MS), {
        sets: [{ exerciseId: pushUpId, reps: 12, weightKg: 0 }],
        picks: [{ category: 'push_up', exerciseId: pushUpId }],
      }),
    ]);
    expect(response.status, response.rawBody).toBe(409);
    expect(response.body.error).toBe('bodyweight_required');
    expect(await sessionsOf(user.id)).toEqual([]);
    expect(await picksOf(user)).toEqual({});
  });

  it('refuses a weight on an exercise that takes none, as complete-session does, and stores nothing', async () => {
    const user = await withBodyweight(await createTestUser());
    const response = await importAs(user, [
      aStrengthActivity(wholeSecondAgo(3 * HOUR_MS), {
        sets: [{ exerciseId: pushUpId, reps: 12, weightKg: 10 }],
        picks: [{ category: 'push_up', exerciseId: pushUpId }],
      }),
    ]);
    expect(response.status, response.rawBody).toBe(422);
    expect(await sessionsOf(user.id)).toEqual([]);
    expect(await picksOf(user)).toEqual({});
  });
});
