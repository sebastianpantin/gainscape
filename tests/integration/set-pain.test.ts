import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { builtInExerciseId, createTestUser, db, postCompleteSession, type TestUser } from './local-stack.ts';
import { aBout, aSet, editSession, hard, hoursAgo, payloadAt, postSession } from './session-support.ts';

async function painAndXpOf(sessionId: string) {
  return await db`
    select position, pain, xp_awarded from public.sets where session_id = ${sessionId} order by position`;
}

async function rehabSession(user: TestUser, hoursBefore: number, pain: number | null) {
  const curlId = await builtInExerciseId('eccentric_wrist_curl');
  const payload = payloadAt(hoursAgo(hoursBefore), [
    aSet(curlId, 0, 6, { reps: 15, pain }),
    aSet(curlId, 1, 6, { reps: 15 }),
  ]);
  await postSession(user, payload);
  return payload;
}

describe('pain on a set', () => {
  it('stores the pain logged on a lift, a hold and a bout, and no pain when none was sent', async () => {
    const user = await createTestUser();
    const curlId = await builtInExerciseId('eccentric_wrist_curl');
    const holdId = await builtInExerciseId('isometric_wrist_flexion');
    const runningId = await builtInExerciseId('running');
    const hold = {
      kind: 'hold' as const,
      id: randomUUID(),
      exerciseId: holdId,
      position: 1,
      weightKg: 4,
      durationS: 45,
      distanceM: null,
      effort: hard,
      pain: 0,
    };
    const payload = {
      ...payloadAt(hoursAgo(2), []),
      sets: [aSet(curlId, 0, 6, { reps: 15, pain: 3 }), hold, aBout(runningId, 2, { pain: 5 }), aSet(curlId, 3, 6)],
    };

    await postSession(user, payload);

    expect((await painAndXpOf(payload.id)).map((row) => row.pain)).toEqual([3, 0, 5, null]);
  });

  it('refuses pain outside 0 to 10 and pain that is not a whole number', async () => {
    const user = await createTestUser();
    const curlId = await builtInExerciseId('eccentric_wrist_curl');
    for (const pain of [-1, 11, 2.5]) {
      const response = await postCompleteSession(
        user.accessToken,
        payloadAt(hoursAgo(2), [aSet(curlId, 0, 6, { reps: 15, pain })]),
      );
      expect(response.status, `pain ${pain}`).toBe(422);
    }
  });

  it('changes only the pain when an Edit changes only the pain', async () => {
    const user = await createTestUser();
    const session = await rehabSession(user, 3, 4);
    const before = await painAndXpOf(session.id);

    await editSession(user, session, [
      { ...session.sets[0], pain: 2 },
      { ...session.sets[1], pain: 1 },
    ]);

    const after = await painAndXpOf(session.id);
    expect(after.map((row) => row.pain)).toEqual([2, 1]);
    expect(after.map((row) => row.xp_awarded)).toEqual(before.map((row) => row.xp_awarded));
  });

  it('keeps the pain of later Sessions when an Edit of an earlier one replays them', async () => {
    const user = await createTestUser();
    const earlier = await rehabSession(user, 6, 2);
    const later = await rehabSession(user, 2, 3);

    await editSession(user, earlier, [{ ...earlier.sets[0], weightKg: 8 }, earlier.sets[1]]);

    expect((await painAndXpOf(later.id)).map((row) => row.pain)).toEqual([3, null]);
  });
});
