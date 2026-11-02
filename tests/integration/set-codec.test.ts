import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeStoredSet, STORED_SET_COLUMNS, type StoredSetColumnRow, storedSetColumnsOf } from '@domain/index.ts';
import { querySessionSets } from '../../web/src/lib/history/history-rules.ts';
import { builtInExerciseId, createHoldExercise, createTestUser, db } from './local-stack.ts';
import { aBout, anIntervalBout, aSet, hoursAgo, payloadAt, postSession } from './session-support.ts';

async function loggedSessionOfEveryKind() {
  const user = await createTestUser();
  const benchId = await builtInExerciseId('barbell_bench_press');
  const runningId = await builtInExerciseId('running');
  const pinchId = await createHoldExercise(user.id, 'time', 'external', { grip: 10000 });
  const carryId = await createHoldExercise(user.id, 'distance', 'external', { grip: 10000 });
  const hold = (exerciseId: string, position: number, measured: { durationS: number } | { distanceM: number }) => ({
    kind: 'hold' as const,
    id: randomUUID(),
    exerciseId,
    position,
    weightKg: 24.5,
    durationS: null,
    distanceM: null,
    ...measured,
    effort: { type: 'level' as const, level: 'hard' as const },
  });
  const sets = [
    aSet(benchId, 0, 40, { isWarmup: true, effort: null }),
    aSet(benchId, 1, 62.5, { reps: 8 }),
    aBout(runningId, 2, { distanceM: 5000 }),
    anIntervalBout(runningId, 3, { workS: 60, restS: 30, rounds: 5 }),
    hold(pinchId, 4, { durationS: 45 }),
    hold(carryId, 5, { distanceM: 40 }),
  ];
  const payload = { ...payloadAt(hoursAgo(2), []), sets };
  await postSession(user, payload);
  return { user, sessionId: payload.id };
}

describe('the set codec against the sets table', () => {
  it('decodes every set kind the server stores, from the edge and the web column lists alike', async () => {
    const { user, sessionId } = await loggedSessionOfEveryKind();

    const rows = await db`
      select ${db([...STORED_SET_COLUMNS])} from public.sets where session_id = ${sessionId} order by position`;
    const fromEdge = rows.map((row) => decodeStoredSet(storedSetColumnsOf(row as unknown as StoredSetColumnRow)));
    const fromWeb = (await querySessionSets(user.client, sessionId)).map(decodeStoredSet);

    expect(fromEdge.map((set) => set.kind)).toEqual(['lift', 'lift', 'cardio', 'cardio', 'hold', 'hold']);
    expect(fromWeb).toEqual(fromEdge);
    expect(fromEdge[0]).toMatchObject({ weightKg: 40, reps: 5, isWarmup: true, effortInputType: null });
    expect(fromEdge[1]).toMatchObject({ weightKg: 62.5, effectiveLoadKg: 62.5, reps: 8, isWarmup: false });
    expect(fromEdge[2]).toMatchObject({ durationS: 1800, distanceM: 5000, interval: null });
    expect(fromEdge[3]).toMatchObject({ interval: { workS: 60, restS: 30, rounds: 5 } });
    expect(fromEdge[4]).toMatchObject({ weightKg: 24.5, durationS: 45, distanceM: null });
    expect(fromEdge[5]).toMatchObject({ weightKg: 24.5, durationS: null, distanceM: 40 });
  });

  it('cannot store a set the codec would refuse to decode', async () => {
    const { sessionId } = await loggedSessionOfEveryKind();

    await expect(
      db`update public.sets set reps = null, weight_kg = null, effective_load_kg = null
         where session_id = ${sessionId} and position = 1`,
    ).rejects.toThrow(/set_is_lift_cardio_or_hold/);
  });
});
