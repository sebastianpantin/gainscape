import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { queryRecentSets } from '../../web/src/lib/progress/recovery-rules.ts';
import { builtInExerciseId, createTestUser, db, type TestUser } from './local-stack.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

async function insertWorkout(
  user: TestUser,
  endedAt: Date,
  sets: { exerciseId: string; rir: number | null; warmup: boolean; source?: 'logged' | 'cold_start' }[],
) {
  const sessionId = randomUUID();
  const iso = endedAt.toISOString();
  await db.begin(async (tx) => {
    await tx`insert into public.sessions ${tx({
      id: sessionId,
      user_id: user.id,
      started_at: iso,
      ended_at: iso,
      local_date: iso.slice(0, 10),
      timezone: 'UTC',
      balance_version: 2,
      derived_balance_version: 2,
      summary: tx.json({ xpBySkill: {}, levelUps: [], prs: [], drops: [] }),
    })}`;
    await tx`insert into public.sets ${tx(
      sets.map((set, position) => ({
        id: randomUUID(),
        session_id: sessionId,
        user_id: user.id,
        exercise_id: set.exerciseId,
        position,
        weight_kg: 60,
        effective_load_kg: 60,
        reps: 5,
        is_warmup: set.warmup,
        rir: set.rir,
        rir_source: set.source ?? 'logged',
        effective_reps: 3,
        xp_awarded: 10,
      })),
    )}`;
  });
  return iso;
}

describe('recent sets for the recovery map', () => {
  let owner: TestUser;
  let other: TestUser;
  let benchId: string;
  let squatId: string;
  let recentEndedAt: string;
  const now = new Date();

  beforeAll(async () => {
    [owner, other] = await Promise.all([createTestUser(), createTestUser()]);
    [benchId, squatId] = await Promise.all([builtInExerciseId('barbell_bench_press'), builtInExerciseId('back_squat')]);
    recentEndedAt = await insertWorkout(owner, new Date(now.getTime() - 2 * DAY_MS), [
      { exerciseId: benchId, rir: 4, warmup: true },
      { exerciseId: benchId, rir: 2, warmup: false },
      { exerciseId: squatId, rir: 0.5, warmup: false },
      { exerciseId: squatId, rir: null, warmup: false, source: 'cold_start' },
    ]);
    await insertWorkout(owner, new Date(now.getTime() - 9 * DAY_MS), [{ exerciseId: squatId, rir: 1, warmup: false }]);
    await insertWorkout(other, new Date(now.getTime() - DAY_MS), [{ exerciseId: benchId, rir: 0, warmup: false }]);
  });

  it("reads only the owner's working sets from workouts that ended inside the window", async () => {
    const sets = await queryRecentSets(owner.client, new Date(now.getTime() - 7 * DAY_MS));
    expect(sets).toHaveLength(3);
    expect(sets).toEqual(
      expect.arrayContaining([
        { exerciseId: squatId, rir: 0.5, endedAt: expect.any(String) },
        { exerciseId: benchId, rir: 2, endedAt: expect.any(String) },
        { exerciseId: squatId, rir: 2, endedAt: expect.any(String) },
      ]),
    );
    expect(sets.every((set) => Date.parse(set.endedAt) === Date.parse(recentEndedAt))).toBe(true);
  });
});
