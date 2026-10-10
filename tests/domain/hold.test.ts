import { describe, expect, it } from 'vitest';
import {
  BodyweightRequiredError,
  type ChallengeDefinition,
  DEFAULT_BALANCE,
  judgeChallenge,
  KindMismatchError,
  lootCandidates,
  processSession,
  qualifies,
  DEFAULT_LOOT,
  type SessionInput,
  type SetInput,
  sameSet,
  writableSetFor,
} from '@domain/index.ts';
import { aHold, aSet, catalog, failure, freshUser, hard, TEST_BALANCE } from './fixtures.ts';

const BODYWEIGHT_KG = 80;
const user = { ...freshUser, bodyweightKg: BODYWEIGHT_KG };

function run(sets: SetInput[]) {
  const session: SessionInput = { id: 'hold-session', startedAt: '2026-10-10T10:00:00.000Z', sets };
  return processSession(user, session, TEST_BALANCE, { catalog }).outputs;
}

describe('hold sets', () => {
  it('counts a hang to failure as one rep per 5 seconds inside the effective-rep window', () => {
    expect(DEFAULT_BALANCE.holdSecondsPerRep).toBe(5);
    const [long, short] = run([
      aHold('dead-hang', 0, { durationS: 40 }, failure),
      aHold('dead-hang', 0, { durationS: 12 }, failure),
    ]).sets;
    expect([long.effectiveReps, long.xp, long.skillXp]).toEqual([6, 60, [{ skillId: 'skill-grip', xp: 60 }]]);
    expect([short.effectiveReps, short.xp]).toEqual([2, 20]);
  });

  it('counts a carry as one rep per 5 metres and splits it by its shares', () => {
    expect(DEFAULT_BALANCE.carryMetresPerRep).toBe(5);
    const [carry] = run([aHold('farmers-carry', 32, { distanceM: 50 }, hard)]).sets;
    expect(carry.effectiveReps).toBe(3);
    expect(carry.effectiveLoadKg).toBe(32);
    expect(carry.skillXp).toEqual([
      { skillId: 'skill-legs', xp: 6 },
      { skillId: 'skill-core', xp: 6 },
      { skillId: 'skill-grip', xp: 18 },
    ]);
  });

  it('assumes a hard effort when none is logged, with no cold start and no intensity bonus', () => {
    expect(DEFAULT_BALANCE.holdDefaultEffort).toBe('hard');
    const [hold] = run([aHold('plate-pinch', 20, { durationS: 60 }, null)]).sets;
    expect(hold).toMatchObject({
      rirSource: 'default',
      rirForXp: TEST_BALANCE.effortLevelRir.hard,
      effectiveReps: 3,
      intensityBonus: 1,
      coldStartXp: 0,
      xp: 30,
      effortInputType: null,
    });
  });

  it('stores the logged effort level of a hold', () => {
    const [hold] = run([aHold('plate-pinch', 20, { durationS: 60 }, failure)]).sets;
    expect(hold).toMatchObject({ rirSource: 'logged', effortInputType: 'level', effortValue: 0, rir: 0 });
  });

  it('takes an effort level only', () => {
    expect(() => run([aHold('plate-pinch', 20, { durationS: 60 }, { type: 'rir', value: 2 })])).toThrow(RangeError);
    expect(() => run([aHold('plate-pinch', 20, { durationS: 60 }, { type: 'rpe', value: 8 })])).toThrow(RangeError);
    expect(() => run([aHold('plate-pinch', 20, { durationS: 60 }, { type: 'cardio', level: 'hard' })])).toThrow(
      RangeError,
    );
  });

  it('adds the bodyweight to a bodyweight hold and needs one', () => {
    const [hang] = run([aHold('dead-hang', 0, { durationS: 30 }, hard)]).sets;
    expect(hang.effectiveLoadKg).toBe(BODYWEIGHT_KG);
    const session: SessionInput = {
      id: 'no-bodyweight',
      startedAt: '2026-10-10T10:00:00.000Z',
      sets: [aHold('dead-hang', 0, { durationS: 30 }, hard)],
    };
    expect(() => processSession(freshUser, session, TEST_BALANCE, { catalog })).toThrow(BodyweightRequiredError);
  });

  it('tracks no strength and no lift records', () => {
    const outputs = run([aHold('plate-pinch', 20, { durationS: 60 }, failure)]);
    expect(outputs.sets[0]).toMatchObject({ e1rmCandidateKg: null, repsCapacityCandidate: null, personalRecord: null });
    expect(outputs.prs).toEqual([]);
  });

  it('refuses a hold on a reps exercise, a rep set on a hold exercise and the wrong measure', () => {
    expect(() => run([aHold('bench', 60, { durationS: 30 }, hard)])).toThrow(KindMismatchError);
    expect(() => run([aSet('plate-pinch', 20, 5, hard)])).toThrow(KindMismatchError);
    expect(() => run([aHold('plate-pinch', 20, { distanceM: 30 }, hard)])).toThrow(KindMismatchError);
    expect(() => run([aHold('farmers-carry', 20, { durationS: 30 }, hard)])).toThrow(KindMismatchError);
    expect(() => run([aHold('run', 0, { durationS: 30 }, hard)])).toThrow(KindMismatchError);
  });

  it('leaves holds out of a kg volume challenge', () => {
    const volume: ChallengeDefinition = { kind: 'volume', metric: 'kg', target: 100, exerciseId: null, minPct: null };
    const outputs = run([aHold('farmers-carry', 100, { distanceM: 50 }, hard)]);
    expect(judgeChallenge(volume, outputs.sets, {}).passed).toBe(false);
  });

  it('qualifies a hold for loot through its effective reps', () => {
    const outputs = run([aHold('dead-hang', 0, { durationS: 30 }, hard)]);
    const [candidate] = lootCandidates(outputs.sets, catalog);
    expect(candidate).toMatchObject({ kind: 'hold', effectiveReps: 3 });
    expect(qualifies('regular', candidate, DEFAULT_LOOT)).toBe(true);
  });

  it('gives a written hold its effective load', () => {
    const hang = aHold('dead-hang', 0, { durationS: 30 }, hard);
    expect(writableSetFor(hang, catalog.exercises.get('dead-hang')!, BODYWEIGHT_KG)).toEqual({
      ...hang,
      effectiveLoadKg: BODYWEIGHT_KG,
    });
    const pinch = aHold('plate-pinch', 15, { durationS: 30 }, hard);
    expect(writableSetFor(pinch, catalog.exercises.get('plate-pinch')!, BODYWEIGHT_KG)).toMatchObject({
      effectiveLoadKg: 15,
    });
  });

  it('sees an unchanged hold as the same set and a longer one as changed', () => {
    const hang = aHold('dead-hang', 0, { durationS: 30 }, hard);
    const stored = {
      kind: 'hold' as const,
      id: hang.id,
      exerciseId: hang.exerciseId,
      position: hang.position,
      weightKg: 0,
      effectiveLoadKg: BODYWEIGHT_KG,
      durationS: 30,
      distanceM: null,
      effortInputType: 'level' as const,
      effortValue: 3,
    };
    expect(sameSet(hang, stored, DEFAULT_BALANCE)).toBe(true);
    expect(sameSet({ ...hang, durationS: 35 }, stored, DEFAULT_BALANCE)).toBe(false);
  });
});
