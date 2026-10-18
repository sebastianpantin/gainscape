import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { builtInExerciseId, db, grantDrop, setBodyweight } from './local-stack.ts';
import {
  aSet,
  expectLedgerMatchesItems,
  payloadAt,
  postSession,
  startsOnOneLocalDay,
  trackedUsers,
} from './session-support.ts';
import {
  BODYWEIGHT_KG,
  CHALLENGE_KEY,
  challengeLedger,
  SCROLL_KEY,
  scrollsHeld,
  storedSession,
  usePrRollsOfTheDay,
} from './challenge-support.ts';

const { freshUser, checkAndClear } = trackedUsers(expectLedgerMatchesItems);

afterEach(async () => {
  await checkAndClear();
});

afterAll(async () => {
  await db.end();
});

describe('claiming a scroll at sync', () => {
  it('completes a normal session when the scroll item is retired', async () => {
    const [deadliftId, pullUpId, benchId] = await Promise.all([
      builtInExerciseId('deadlift'),
      builtInExerciseId('pull_up'),
      builtInExerciseId('barbell_bench_press'),
    ]);
    const [{ id: challengeId }] = await db`select id from public.challenges where key = ${CHALLENGE_KEY}`;
    const [quietAt, sessionAt] = startsOnOneLocalDay(2);
    const user = await freshUser();
    await setBodyweight(user, BODYWEIGHT_KG);
    const quiet = payloadAt(quietAt, [aSet(benchId, 0, 40, { isWarmup: true })]);
    await postSession(user, quiet);
    await usePrRollsOfTheDay(user.id, quiet.id);
    await grantDrop(user.id, quiet.id, randomUUID(), SCROLL_KEY, 1);
    const sets = [
      ...Array.from({ length: 5 }, () => aSet(deadliftId, 0, 100)),
      ...Array.from({ length: 5 }, () => aSet(pullUpId, 0, 0)),
    ].map((set, position) => ({ ...set, position }));
    const session = { ...payloadAt(sessionAt, sets), challenge: { challengeId } };

    await db`update public.items set retired_at = now() where key = ${SCROLL_KEY}`;
    try {
      const response = await postSession(user, session);
      expect(response.body.challenge).toBeNull();
    } finally {
      await db`update public.items set retired_at = null where key = ${SCROLL_KEY}`;
    }

    expect((await storedSession(session.id)).challenge).toBeNull();
    expect(await scrollsHeld(user.id)).toBe(1);
    expect(await challengeLedger(user.id)).toEqual([]);
  });
});
