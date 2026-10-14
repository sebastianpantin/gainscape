import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builtInExerciseId, createTestUser, db, postFunction } from './local-stack.ts';
import { aSet, hoursAgo, payloadAt, postSession } from './session-support.ts';

let benchId: string;
let benchApprenticeId: string;
const malformedQuestId = randomUUID();

beforeAll(async () => {
  benchId = await builtInExerciseId('barbell_bench_press');
  const [quest] = await db`
    update public.quests set retired_at = now() where key = 'bench_apprentice' returning id`;
  benchApprenticeId = quest.id;
  await db`
    insert into public.quests (id, key, name, description, quest_points, sort_order, definition)
    values (${malformedQuestId}, 'malformed_test_quest', 'Malformed Test Quest', 'A quest no server can read.', 1, 9999,
            ${db.json({ steps: [{ kind: 'dance' }], requiredLevels: [], requiredQuestIds: [], rewardXp: {} })})`;
});

afterAll(async () => {
  await db`update public.quests set retired_at = null where id = ${benchApprenticeId}`;
  await db`delete from public.quest_progress where quest_id = ${malformedQuestId}`;
  await db`delete from public.quests where id = ${malformedQuestId}`;
  await db.end();
});

async function seedProgressStartedDaysAgo(userId: string, questId: string) {
  const [row] = await db`
    insert into public.quest_progress (user_id, quest_id, started_at)
    values (${userId}, ${questId}, date_trunc('milliseconds', now() - interval '3 days'))
    returning started_at`;
  return (row.started_at as Date).toISOString();
}

describe('a retired quest', () => {
  it('can no longer be started', async () => {
    const user = await createTestUser();
    const response = await postFunction('start-quest', user.accessToken, { questId: benchApprenticeId });
    expect(response.status, response.rawBody).toBe(404);
    expect(response.body.error).toBe('quest_not_found');
  });

  it('answers the existing progress to a repeated start from a user who started it before it was retired', async () => {
    const user = await createTestUser();
    const startedAt = await seedProgressStartedDaysAgo(user.id, benchApprenticeId);
    const response = await postFunction('start-quest', user.accessToken, { questId: benchApprenticeId });
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body).toEqual({ questId: benchApprenticeId, startedAt, stepIndex: 0, stepProgress: 0 });
  });

  it('keeps advancing for a user who started it before it was retired', async () => {
    const user = await createTestUser();
    await seedProgressStartedDaysAgo(user.id, benchApprenticeId);
    const response = await postSession(user, payloadAt(hoursAgo(5), [aSet(benchId, 0, 60)]));
    expect(response.body.quests?.progressed).toEqual([
      { questId: benchApprenticeId, stepIndex: 0, stepProgress: 1, stepTarget: 3 },
    ]);
  });
});

describe('a quest whose stored definition no server can read', () => {
  it('cannot be started', async () => {
    const user = await createTestUser();
    const response = await postFunction('start-quest', user.accessToken, { questId: malformedQuestId });
    expect(response.status, response.rawBody).toBe(404);
    expect(response.body.error).toBe('quest_not_found');
  });

  it('does not stop a sync, which leaves its progress untouched and advances the other quests', async () => {
    const user = await createTestUser();
    await seedProgressStartedDaysAgo(user.id, benchApprenticeId);
    await seedProgressStartedDaysAgo(user.id, malformedQuestId);
    const response = await postSession(user, payloadAt(hoursAgo(5), [aSet(benchId, 0, 60)]));
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.quests?.progressed).toEqual([
      { questId: benchApprenticeId, stepIndex: 0, stepProgress: 1, stepTarget: 3 },
    ]);
    const [malformed] = await db`
      select step_index, step_progress from public.quest_progress
      where user_id = ${user.id} and quest_id = ${malformedQuestId}`;
    expect({ stepIndex: malformed.step_index, stepProgress: Number(malformed.step_progress) }).toEqual({
      stepIndex: 0,
      stepProgress: 0,
    });
  });
});
