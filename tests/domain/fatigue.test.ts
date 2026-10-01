import { describe, expect, it } from 'vitest';
import { epley, type ExerciseStrength, processSession, type SessionInput } from '@domain/index.ts';
import { aBout, aSet, catalog, failure, TEST_BALANCE } from './fixtures.ts';

function runSets(
  sets: SessionInput['sets'],
  strength: Record<string, ExerciseStrength> = {},
  bodyweightKg: number | null = null,
) {
  const session: SessionInput = { id: 'session', startedAt: '2026-09-28T10:00:00.000Z', sets };
  return processSession({ skillXp: {}, bodyweightKg }, session, TEST_BALANCE, { catalog, strength }).outputs.sets;
}

function known(exerciseId: string, windowMax: number): Record<string, ExerciseStrength> {
  return { [exerciseId]: { windowMax, fallbackMax: null, hasPriorSession: true } };
}

function repeated(count: number, build: () => SessionInput['sets'][number]): SessionInput['sets'] {
  return Array.from({ length: count }, build);
}

function totalEffectiveReps(results: ReturnType<typeof runSets>): number {
  return results.reduce((sum, result) => sum + result.effectiveReps, 0);
}

describe('fatigue check', () => {
  it('flags repeated identical sets that all claim failure', () => {
    const results = runSets(
      repeated(10, () => aSet('bench', 100, 6, failure)),
      known('bench', epley(100, 6)),
    );
    expect(results[0]).toMatchObject({ rirFlagged: true });
    expect(results[0].effectiveReps).toBeLessThan(6);
    expect(results.at(-1)!.effectiveReps).toBe(6);
    expect(totalEffectiveReps(results)).toBeLessThan(40);
  });

  it('trusts honest sets to failure whose reps decline with fatigue', () => {
    const results = runSets(
      [8, 7, 6, 6].map((reps) => aSet('bench', 100, reps, failure)),
      known('bench', 120),
    );
    expect(results.map((result) => result.rirFlagged)).toEqual([false, false, false, false]);
    expect(results.map((result) => result.effectiveReps)).toEqual([6, 6, 6, 6]);
  });

  it('checks high-rep sets that never produce an e1RM', () => {
    const results = runSets(repeated(10, () => aSet('bench', 20, 15, failure)));
    expect(results[0]).toMatchObject({ rirFlagged: true, effectiveReps: 0 });
  });

  it('flags repeated bodyweight sets that all claim failure', () => {
    const results = runSets(
      repeated(10, () => aSet('pull-up', 0, 10, failure)),
      known('pull-up', 10),
      80,
    );
    expect(results[0]).toMatchObject({ rirFlagged: true, effectiveReps: 0 });
  });

  it('trusts honest bodyweight sets to failure', () => {
    const results = runSets(
      [12, 10, 9, 8].map((reps) => aSet('pull-up', 0, reps, failure)),
      known('pull-up', 12),
      80,
    );
    expect(results.map((result) => result.rirFlagged)).toEqual([false, false, false, false]);
  });

  it('builds no fatigue from a hard cardio bout between two sets', () => {
    const first = aSet('bench', 100, 6, failure);
    const second = aSet('bench', 100, 6, failure);
    const bout = aBout('sprints', 1800, { type: 'cardio', level: 'max' });
    const strength = known('bench', epley(100, 6));
    const withoutBout = runSets([first, second], strength);
    const withBout = runSets([first, { ...bout, position: first.position + 0.5 }, second], strength);
    const lifts = withBout.filter((result) => result.cardio === null);
    expect(lifts.map((result) => [result.rirForXp, result.intensityBonus])).toEqual(
      withoutBout.map((result) => [result.rirForXp, result.intensityBonus]),
    );
    expect(lifts).toEqual(withoutBout);
  });

  it('judges each exercise only by its own later sets', () => {
    const results = runSets([aSet('bench', 100, 6, failure), ...repeated(9, () => aSet('squat', 100, 6, failure))]);
    expect(results[0]).toMatchObject({ rirFlagged: false, effectiveReps: 6 });
  });

  it('builds no fatigue from sets that lift no load', () => {
    const results = runSets(
      [...repeated(20, () => aSet('bench', 0, 1, failure)), aSet('bench', 70, 6, failure)],
      known('bench', 100),
    );
    expect(results.at(-1)).toMatchObject({ rirFlagged: true });
  });

  it('ignores warm-ups', () => {
    const results = runSets([
      aSet('bench', 100, 6, failure),
      ...repeated(9, () => aSet('bench', 100, 6, failure, { isWarmup: true })),
    ]);
    expect(results[0]).toMatchObject({ rirFlagged: false, effectiveReps: 6 });
  });
});
