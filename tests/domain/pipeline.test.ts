import { describe, expect, it } from 'vitest';
import { BodyweightRequiredError, processSession, type SessionInput, UnknownExerciseError } from '@domain/index.ts';
import { aSet, catalog, freshUser, hard, nearFailure, TEST_BALANCE } from './fixtures.ts';

const threeSets = (exerciseId: string, weightKg: number, effort: typeof hard | typeof nearFailure) =>
  [0, 1, 2].map(() => aSet(exerciseId, weightKg, 8, effort));

const fixtureSession: SessionInput = {
  id: 'session-1',
  startedAt: '2026-09-28T10:00:00Z',
  sets: [...threeSets('bench', 60, hard), ...threeSets('squat', 100, nearFailure)],
};

describe('processSession', () => {
  it('awards XP per skill, with an intensity bonus once an e1RM exists within the session', () => {
    const { nextState, outputs } = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    expect(outputs.sets.map((result) => result.xp)).toEqual([30, 30, 30, 50, 53, 53]);
    expect(outputs.xpBySkill).toEqual({ chest: 63, shoulders: 18, arms: 9, legs: 141, core: 15 });
    expect(outputs.levelUps).toEqual([{ skill: 'legs', from: 1, to: 2 }]);
    expect(nextState.skillXp['skill-legs']).toBe(141);
  });

  it('is deterministic', () => {
    const first = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    const second = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    expect(second).toEqual(first);
  });

  it('builds on existing XP', () => {
    const { outputs } = processSession(
      { skillXp: { 'skill-legs': 100 }, bodyweightKg: null },
      fixtureSession,
      TEST_BALANCE,
      { catalog },
    );
    expect(outputs.levelUps).toContainEqual({ skill: 'legs', from: 2, to: 3 });
  });

  it('treats unrated sets in the first session of an exercise as cold start', () => {
    const unrated = { ...fixtureSession, sets: [aSet('bench', 60, 8, null)] };
    const { outputs } = processSession(freshUser, unrated, TEST_BALANCE, { catalog });
    expect(outputs.sets[0]).toMatchObject({
      effortInputType: null,
      effortValue: null,
      rir: null,
      rirSource: 'cold_start',
      xp: 10,
    });
  });

  it('rejects exercises missing from the catalog', () => {
    const unknown = { ...fixtureSession, sets: [aSet('nope', 60, 8, hard)] };
    expect(() => processSession(freshUser, unknown, TEST_BALANCE, { catalog })).toThrow(UnknownExerciseError);
  });

  it('requires bodyweight for bodyweight exercises', () => {
    const pullUps = { ...fixtureSession, sets: [aSet('pull-up', 0, 8, hard)] };
    expect(() => processSession(freshUser, pullUps, TEST_BALANCE, { catalog })).toThrow(BodyweightRequiredError);
  });

  it('uses bodyweight plus added load as the effective load', () => {
    const weighted = { ...fixtureSession, sets: [aSet('weighted-pull-up', 10, 5, hard), aSet('pull-up', 0, 10, hard)] };
    const { outputs } = processSession({ skillXp: {}, bodyweightKg: 80 }, weighted, TEST_BALANCE, { catalog });
    expect(outputs.sets.map((result) => result.effectiveLoadKg)).toEqual([90, 80]);
  });

  it('prefers a recorded effective load over the current bodyweight', () => {
    const replayed = { ...fixtureSession, sets: [aSet('pull-up', 0, 10, hard, { recordedEffectiveLoadKg: 75 })] };
    const { outputs } = processSession({ skillXp: {}, bodyweightKg: 80 }, replayed, TEST_BALANCE, { catalog });
    expect(outputs.sets[0].effectiveLoadKg).toBe(75);
  });

  it('lets callers replace the step list', () => {
    const { outputs } = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog }, []);
    expect(outputs.sets).toEqual([]);
  });
});
