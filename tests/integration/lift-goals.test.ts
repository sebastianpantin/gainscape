import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryLiftGoals, removeLiftGoalWith, saveLiftGoalWith } from '../../web/src/lib/progress/lift-goal-rules.ts';
import { logOneSession } from './account-support.ts';
import { builtInExerciseId, createTestUser, db, type TestUser } from './local-stack.ts';

describe('lift goals', () => {
  let owner: TestUser;
  let bystander: TestUser;
  let benchId: string;
  let squatId: string;

  beforeAll(async () => {
    [owner, bystander] = await Promise.all([createTestUser(), createTestUser()]);
    [benchId, squatId] = await Promise.all([builtInExerciseId('barbell_bench_press'), builtInExerciseId('back_squat')]);
  });

  afterAll(async () => {
    await db.end();
  });

  it('reads saved goals with their exercise and progress from the rep maxes', async () => {
    await logOneSession(owner, 80);
    await saveLiftGoalWith(owner.client, { exerciseId: benchId, targetKg: 80, reps: 8, targetDate: null });
    await saveLiftGoalWith(owner.client, { exerciseId: squatId, targetKg: 140, reps: 5, targetDate: '2026-12-01' });
    await saveLiftGoalWith(bystander.client, { exerciseId: squatId, targetKg: 60, reps: 1, targetDate: null });

    const statuses = await queryLiftGoals(owner.client, owner.id, AbortSignal.timeout(10_000));

    expect(statuses.map(({ goal }) => goal)).toEqual([
      {
        exerciseId: squatId,
        exerciseName: 'Back Squat',
        loadType: 'external',
        targetKg: 140,
        reps: 5,
        targetDate: '2026-12-01',
      },
      {
        exerciseId: benchId,
        exerciseName: 'Barbell Bench Press',
        loadType: 'external',
        targetKg: 80,
        reps: 8,
        targetDate: null,
      },
    ]);
    expect(statuses[0]).toMatchObject({ achievedAt: null, bestE1rmKg: null, fraction: 0 });
    expect(statuses[1]).toMatchObject({ achievedAt: expect.any(String), bestE1rmKg: 98.67, fraction: 1 });
  });

  it('edits a goal in place and removes it', async () => {
    await saveLiftGoalWith(owner.client, { exerciseId: benchId, targetKg: 90, reps: 5, targetDate: null });
    let statuses = await queryLiftGoals(owner.client, owner.id, AbortSignal.timeout(10_000));
    expect(statuses.filter(({ goal }) => goal.exerciseId === benchId).map(({ goal }) => goal.targetKg)).toEqual([90]);

    await removeLiftGoalWith(owner.client, benchId);
    statuses = await queryLiftGoals(owner.client, owner.id, AbortSignal.timeout(10_000));
    expect(statuses.map(({ goal }) => goal.exerciseId)).toEqual([squatId]);
  });
});
