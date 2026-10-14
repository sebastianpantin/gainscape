import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builtInExerciseId, createTestUser, db, postFunction } from './local-stack.ts';
import { aSet, hoursAgo, payloadAt, postSession } from './session-support.ts';

let benchId: string;
let benchApprenticeId: string;

beforeAll(async () => {
  benchId = await builtInExerciseId('barbell_bench_press');
  const [quest] = await db`
    update public.quests set retired_at = now() where key = 'bench_apprentice' returning id`;
  benchApprenticeId = quest.id;
});

afterAll(async () => {
  await db`update public.quests set retired_at = null where id = ${benchApprenticeId}`;
  await db.end();
});

describe('a retired quest', () => {
  it('can no longer be started', async () => {
    const user = await createTestUser();
    const response = await postFunction('start-quest', user.accessToken, { questId: benchApprenticeId });
    expect(response.status, response.rawBody).toBe(404);
    expect(response.body.error).toBe('quest_not_found');
  });

  it('keeps advancing for a user who started it before it was retired', async () => {
    const user = await createTestUser();
    await db`
      insert into public.quest_progress (user_id, quest_id, started_at)
      values (${user.id}, ${benchApprenticeId}, now() - interval '3 days')`;
    const response = await postSession(user, payloadAt(hoursAgo(5), [aSet(benchId, 0, 60)]));
    expect(response.body.quests?.progressed).toEqual([
      { questId: benchApprenticeId, stepIndex: 0, stepProgress: 1, stepTarget: 3 },
    ]);
  });
});
