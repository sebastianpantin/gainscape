import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BodyweightLoadNotZeroError,
  BodyweightRequiredError,
  cardioExercise,
  carriedEffectiveLoadKg,
  challengeBonusXp,
  type ChallengeRun,
  type Catalog,
  type CardioSetInput,
  type EffortInput,
  type ExerciseDef,
  GEAR_SLOTS,
  gearBonusXp,
  type GearLoadout,
  historyOnlySummary,
  KindMismatchError,
  liftExerciseFor,
  type LiftSetInput,
  pendingSummary,
  processSession,
  resolveHistoryOnlySets,
  type SessionInput,
  setKind,
  strengthHistoryRows,
  UnknownExerciseError,
  writableSetFor,
  DistanceNotTrackedError,
} from '@domain/index.ts';
import { aBout, aSet, catalog, freshUser, hard, nearFailure, TEST_BALANCE } from './fixtures.ts';

const threeSets = (exerciseId: string, weightKg: number, effort: typeof hard | typeof nearFailure) =>
  [0, 1, 2].map(() => aSet(exerciseId, weightKg, 8, effort));

const fixtureSession: SessionInput = {
  id: 'session-1',
  startedAt: '2026-09-28T10:00:00Z',
  sets: [...threeSets('bench', 60, hard), ...threeSets('squat', 100, nearFailure)],
};

describe('processSession', () => {
  it('awards XP per skill, paying identical sets the same intensity bonus even before any e1RM exists', () => {
    const { nextState, outputs } = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    expect(outputs.sets.map((result) => result.xp)).toEqual([30, 30, 30, 55, 55, 55]);
    expect(outputs.xpBySkill).toEqual({ chest: 63, shoulders: 18, arms: 9, legs: 149, core: 16 });
    expect(outputs.levelUps).toEqual([{ skill: 'legs', from: 1, to: 2 }]);
    expect(nextState.skillXp['skill-legs']).toBe(149);
  });

  it('reports only the XP that fits under the XP cap', () => {
    const nearCap = { skillXp: { 'skill-chest': TEST_BALANCE.maxXp - 5 }, bodyweightKg: null };
    const session: SessionInput = {
      id: 'capped',
      startedAt: '2026-09-28T10:00:00Z',
      sets: [aSet('bench', 60, 8, hard)],
    };
    const { outputs } = processSession(nearCap, session, TEST_BALANCE, { catalog });
    expect(outputs.xpBySkill.chest).toBe(5);
  });

  it('rotates tied remainders across sets of the same exercise', () => {
    const cfg = { ...TEST_BALANCE, xpPerEffectiveRep: 75 };
    const fiveEffectiveReps = { type: 'rir', value: 1 } as const;
    const session: SessionInput = {
      id: 'rotation',
      startedAt: '2026-09-28T10:00:00Z',
      sets: [
        aSet('bench', 20, 11, fiveEffectiveReps),
        aSet('squat', 100, 5, hard),
        aSet('bench', 20, 11, fiveEffectiveReps),
      ],
    };
    const { outputs } = processSession(freshUser, session, cfg, { catalog });
    expect(outputs.sets[0].skillXp).toEqual([
      { skillId: 'skill-chest', xp: 263 },
      { skillId: 'skill-shoulders', xp: 75 },
      { skillId: 'skill-arms', xp: 37 },
    ]);
    expect(outputs.sets[2].skillXp).toEqual([
      { skillId: 'skill-chest', xp: 262 },
      { skillId: 'skill-shoulders', xp: 75 },
      { skillId: 'skill-arms', xp: 38 },
    ]);
  });

  it('rotates tied remainders only across sets that earn XP', () => {
    const cfg = { ...TEST_BALANCE, xpPerEffectiveRep: 75 };
    const fiveEffectiveReps = { type: 'rir', value: 1 } as const;
    const session: SessionInput = {
      id: 'rotation-warmup',
      startedAt: '2026-09-28T10:00:00Z',
      sets: [aSet('bench', 10, 11, hard, { isWarmup: true }), aSet('bench', 20, 11, fiveEffectiveReps)],
    };
    const { outputs } = processSession(freshUser, session, cfg, { catalog });
    expect(outputs.sets[1].skillXp).toContainEqual({ skillId: 'skill-chest', xp: 263 });
  });

  it('pins the derived columns of every set', () => {
    const { outputs } = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    const bench = (e1rmBeforeKg: number | null) => ({
      rir: 3,
      rirSource: 'logged',
      effectiveReps: 3,
      intensityBonus: 1,
      e1rmBeforeKg,
      e1rmCandidateKg: 80,
      skillXp: [
        { skillId: 'skill-chest', xp: 21 },
        { skillId: 'skill-shoulders', xp: 6 },
        { skillId: 'skill-arms', xp: 3 },
      ],
    });
    const squat = (e1rmBeforeKg: number | null, intensityBonus: number, legsXp: number, coreXp: number) => ({
      rir: 1,
      rirSource: 'logged',
      effectiveReps: 5,
      intensityBonus,
      e1rmBeforeKg,
      e1rmCandidateKg: 126.67,
      skillXp: [
        { skillId: 'skill-legs', xp: legsXp },
        { skillId: 'skill-core', xp: coreXp },
      ],
    });
    expect(outputs.sets).toMatchObject([
      bench(null),
      bench(80),
      bench(80),
      squat(null, 1.091216, 50, 5),
      squat(126.67, 1.091216, 49, 6),
      squat(126.67, 1.091216, 50, 5),
    ]);
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

  it('rejects added load on a pure bodyweight exercise even with a recorded load', () => {
    const replayed = { ...fixtureSession, sets: [aSet('pull-up', 5, 10, hard, { recordedEffectiveLoadKg: 85 })] };
    expect(() => processSession({ skillXp: {}, bodyweightKg: 80 }, replayed, TEST_BALANCE, { catalog })).toThrow(
      BodyweightLoadNotZeroError,
    );
  });
});

describe('lift results beside cardio bouts', () => {
  const liftEffort = fc.constantFrom<EffortInput>(
    null,
    { type: 'level', level: 'hard' },
    { type: 'level', level: 'failure' },
    { type: 'rir', value: 2 },
    { type: 'rpe', value: 9 },
  );
  const cardioEffort = fc.constantFrom<EffortInput>(
    null,
    { type: 'cardio', level: 'easy' },
    { type: 'cardio', level: 'max' },
  );
  const lift = fc.record({
    exerciseId: fc.constantFrom('bench', 'squat', 'pull-up', 'weighted-pull-up', 'custom-press'),
    weightKg: fc.integer({ min: 0, max: 160 }),
    reps: fc.integer({ min: 1, max: 20 }),
    isWarmup: fc.boolean(),
    effort: liftEffort,
  });
  const bout = fc.record({
    exerciseId: fc.constantFrom('run', 'sprints', 'walk', 'row-intervals', 'custom-run'),
    durationS: fc.integer({ min: 60, max: 14_400 }),
    distanceM: fc.option(fc.integer({ min: 1, max: 60_000 }), { nil: null }),
    interval: fc.option(
      fc.record({
        workS: fc.integer({ min: 5, max: 120 }),
        restS: fc.integer({ min: 0, max: 120 }),
        rounds: fc.integer({ min: 1, max: 30 }),
      }),
      { nil: null },
    ),
    effort: cardioEffort,
    slot: fc.nat(),
  });
  const strength = {
    bench: { windowMax: 90, fallbackMax: 90, hasPriorSession: true },
    'pull-up': { windowMax: 12, fallbackMax: 12, hasPriorSession: true },
  };

  it('are identical with or without interleaved cardio bouts', () => {
    fc.assert(
      fc.property(fc.array(lift, { minLength: 1, maxLength: 12 }), fc.array(bout, { maxLength: 6 }), (lifts, bouts) => {
        const liftSets: LiftSetInput[] = lifts.map((entry, index) => {
          const weightKg = entry.exerciseId === 'pull-up' ? 0 : entry.weightKg;
          return { ...entry, weightKg, id: `lift-${index}`, position: index * 10 };
        });
        const cardioSets: CardioSetInput[] = bouts.map(({ slot, ...entry }, index) => ({
          ...entry,
          kind: 'cardio',
          id: `bout-${index}`,
          position: (slot % (lifts.length + 1)) * 10 - 5 + index / 10,
        }));
        const run = (sets: SessionInput['sets']) =>
          processSession(
            { skillXp: {}, bodyweightKg: 80 },
            { id: 'mixed', startedAt: '2026-09-28T10:00:00.000Z', sets },
            TEST_BALANCE,
            { catalog, strength },
          );
        const liftOnly = run(liftSets);
        const mixed = run([...liftSets, ...cardioSets]);
        const mixedLifts = mixed.outputs.sets.filter((result) => result.cardio === null);
        expect(mixedLifts).toEqual(liftOnly.outputs.sets);
        expect({ ...mixed.nextState.records, cardio: {} }).toEqual(liftOnly.nextState.records);
        expect(mixed.outputs.prs.filter((pr) => pr.kind !== 'cardio')).toEqual(liftOnly.outputs.prs);
        expect(strengthHistoryRows({ id: 'mixed', startedAt: '2026-09-28T10:00:00.000Z' }, mixed.outputs.sets)).toEqual(
          strengthHistoryRows({ id: 'mixed', startedAt: '2026-09-28T10:00:00.000Z' }, liftOnly.outputs.sets),
        );
        for (const skill of ['chest', 'back', 'shoulders', 'arms', 'legs', 'core']) {
          expect(mixed.outputs.xpBySkill[skill]).toBe(liftOnly.outputs.xpBySkill[skill]);
        }
      }),
    );
  });
});

describe('resolveHistoryOnlySets', () => {
  const heavy = { ...fixtureSession, sets: [aSet('bench', 100, 5, hard), aSet('bench', 100, 5, null)] };
  const strength = { bench: { windowMax: 90, fallbackMax: 90, hasPriorSession: true } };

  it('keeps the logged effort, pays no XP and marks no records', () => {
    const sets = resolveHistoryOnlySets(heavy, TEST_BALANCE, { catalog, strength });
    expect(sets.map((result) => [result.rir, result.rirSource])).toEqual([
      [3, 'logged'],
      [null, 'cold_start'],
    ]);
    for (const result of sets) {
      expect(result).toMatchObject({
        xp: 0,
        effectiveReps: 0,
        e1rmCandidateKg: null,
        repsCapacityCandidate: null,
        personalRecord: null,
      });
    }
  });
});

describe('carriedEffectiveLoadKg', () => {
  const external: ExerciseDef = catalog.exercises.get('bench')!;
  const pullUp: ExerciseDef = catalog.exercises.get('pull-up')!;
  const weightedDip: ExerciseDef = { id: 'weighted-dip', loadType: 'bodyweight_plus', builtIn: true, shares: [] };

  it('uses the new weight for an external exercise', () => {
    const stored = { exerciseId: 'bench', weightKg: 60, effectiveLoadKg: 60 };
    expect(carriedEffectiveLoadKg(stored, { exerciseId: 'bench', weightKg: 62.5 }, external, 80)).toBe(62.5);
  });

  it('keeps the logged bodyweight when only the added load changes', () => {
    const stored = { exerciseId: 'weighted-dip', weightKg: 10, effectiveLoadKg: 90 };
    expect(carriedEffectiveLoadKg(stored, { exerciseId: 'weighted-dip', weightKg: 20 }, weightedDip, 85)).toBe(100);
  });

  it('rounds the carried load to 2 decimals', () => {
    const stored = { exerciseId: 'weighted-dip', weightKg: 0.2, effectiveLoadKg: 80.3 };
    expect(carriedEffectiveLoadKg(stored, { exerciseId: 'weighted-dip', weightKg: 0.1 }, weightedDip, 85)).toBe(80.2);
  });

  it('uses the current bodyweight when the exercise changes', () => {
    const stored = { exerciseId: 'weighted-dip', weightKg: 10, effectiveLoadKg: 90 };
    expect(carriedEffectiveLoadKg(stored, { exerciseId: 'pull-up', weightKg: 0 }, pullUp, 85)).toBe(85);
  });

  it('requires a bodyweight when the exercise changes to a bodyweight one', () => {
    const stored = { exerciseId: 'bench', weightKg: 60, effectiveLoadKg: 60 };
    expect(() => carriedEffectiveLoadKg(stored, { exerciseId: 'pull-up', weightKg: 0 }, pullUp, null)).toThrow(
      BodyweightRequiredError,
    );
  });

  it('rejects a cardio exercise, which carries no load', () => {
    const stored = { exerciseId: 'run', weightKg: 0, effectiveLoadKg: 0 };
    expect(() =>
      carriedEffectiveLoadKg(stored, { exerciseId: 'run', weightKg: 0 }, catalog.exercises.get('run')!, 80),
    ).toThrow(KindMismatchError);
  });

  it('rejects added load on a pure bodyweight exercise', () => {
    const stored = { exerciseId: 'pull-up', weightKg: 0, effectiveLoadKg: 80 };
    expect(() => carriedEffectiveLoadKg(stored, { exerciseId: 'pull-up', weightKg: 5 }, pullUp, 80)).toThrow(
      BodyweightLoadNotZeroError,
    );
  });
});

describe('exercise lookup', () => {
  it('finds a lift exercise for a lift set', () => {
    expect(liftExerciseFor(aSet('bench', 60, 5, hard), catalog)).toBe(catalog.exercises.get('bench'));
  });

  it('rejects a lift set on a cardio exercise and an exercise missing from the catalog', () => {
    expect(() => liftExerciseFor(aSet('run', 0, 5, hard), catalog)).toThrow(KindMismatchError);
    expect(() => liftExerciseFor(aSet('missing', 0, 5, hard), catalog)).toThrow(UnknownExerciseError);
  });

  it('finds a cardio exercise and rejects a lift one', () => {
    const run = catalog.exercises.get('run')!;
    expect(cardioExercise(run)).toBe(run);
    expect(() => cardioExercise(catalog.exercises.get('bench')!)).toThrow(KindMismatchError);
  });
});

describe('setKind', () => {
  it('reads a set without a kind as a lift', () => {
    expect(setKind(aSet('bench', 60, 5, hard))).toBe('lift');
    expect(setKind(aSet('bench', 60, 5, hard, { kind: 'lift' }))).toBe('lift');
    expect(setKind(aBout('run', 1800, null))).toBe('cardio');
  });
});

describe('writableSetFor', () => {
  const exercise = (id: string) => catalog.exercises.get(id)!;

  it('passes a bout on a cardio exercise through unchanged', () => {
    const bout = aBout('run', 1800, null);
    expect(writableSetFor(bout, exercise('run'), null)).toBe(bout);
  });

  it('rejects a bout on a lift exercise and a lift set on a cardio exercise', () => {
    expect(() => writableSetFor(aBout('run', 1800, null), exercise('bench'), null)).toThrow(KindMismatchError);
    expect(() => writableSetFor(aSet('run', 0, 5, hard), exercise('run'), null)).toThrow(KindMismatchError);
  });

  it('rejects a distance on an activity that tracks none, and takes the bout without one', () => {
    expect(() => writableSetFor(aBout('stretch', 1200, null, { distanceM: 500 }), exercise('stretch'), null)).toThrow(
      DistanceNotTrackedError,
    );
    const bout = aBout('stretch', 1200, null);
    expect(writableSetFor(bout, exercise('stretch'), null)).toBe(bout);
  });

  it('gives a new lift set its effective load from the current bodyweight', () => {
    const set = aSet('weighted-pull-up', 10, 5, hard);
    expect(writableSetFor(set, exercise('weighted-pull-up'), 80)).toEqual({ ...set, effectiveLoadKg: 90 });
    expect(writableSetFor(aSet('bench', 60, 5, hard), exercise('bench'), 80)).toMatchObject({ effectiveLoadKg: 60 });
  });

  it('carries the logged bodyweight of a stored set of the same exercise', () => {
    const set = aSet('weighted-pull-up', 15, 5, hard);
    const stored = { exerciseId: 'weighted-pull-up', weightKg: 10, effectiveLoadKg: 85 };
    expect(writableSetFor(set, exercise('weighted-pull-up'), 80, stored)).toEqual({ ...set, effectiveLoadKg: 90 });
  });

  it('rejects added load on a pure bodyweight exercise', () => {
    expect(() => writableSetFor(aSet('pull-up', 5, 5, hard), exercise('pull-up'), 80)).toThrow(
      BodyweightLoadNotZeroError,
    );
  });
});

describe('session summaries', () => {
  it('marks a history-only session with nothing earned', () => {
    expect(historyOnlySummary('session-1')).toEqual({
      sessionId: 'session-1',
      xpBySkill: {},
      levelUps: [],
      prs: [],
      drops: [],
      historyOnly: true,
    });
  });

  it('starts a replayed session with its id and no drops', () => {
    expect(pendingSummary('session-1')).toEqual({ sessionId: 'session-1', drops: [] });
  });
});

describe('gear bonus', () => {
  const ascendantBelt: GearLoadout = { belt: 'ascendant' };
  const fullAscendant: GearLoadout = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, 'ascendant']));
  const withGear = (session: SessionInput, gearLoadout: GearLoadout | null | undefined): SessionInput => ({
    ...session,
    gearLoadout,
  });

  it('adds the belt bonus per skill on top of the split XP and reports it', () => {
    const { nextState, outputs } = processSession(freshUser, withGear(fixtureSession, ascendantBelt), TEST_BALANCE, {
      catalog,
    });
    expect(outputs.sets.map((result) => result.xp)).toEqual([30, 30, 30, 55, 55, 55]);
    expect(outputs.xpBySkill).toEqual({ chest: 63, shoulders: 18, arms: 9, legs: 154, core: 18 });
    expect(outputs.gearBonusBySkill).toEqual({ legs: 5, core: 2 });
    expect(nextState.skillXp['skill-legs']).toBe(154);
  });

  it.each([undefined, null, {}])('leaves a session with gear loadout %j exactly as it was', (gearLoadout) => {
    const gearless = processSession(freshUser, fixtureSession, TEST_BALANCE, { catalog });
    const snapshot = processSession(freshUser, withGear(fixtureSession, gearLoadout), TEST_BALANCE, { catalog });
    expect(snapshot).toEqual(gearless);
    expect(snapshot.outputs.gearBonusBySkill).toBeUndefined();
  });

  describe('spreading the bonus over the sets', () => {
    const legPressCatalog: Catalog = {
      skills: catalog.skills,
      exercises: new Map([
        ...catalog.exercises,
        [
          'leg-press',
          {
            id: 'leg-press',
            loadType: 'external',
            builtIn: true,
            shares: [{ skillId: 'skill-legs', shareBasisPoints: 10000 }],
          },
        ],
      ]),
    };
    const flatCfg = { ...TEST_BALANCE, xpPerEffectiveRep: 25, intensityBonusStart: 2, intensityBonusFull: 3 };
    const toFailure = { type: 'rir', value: 0 } as const;
    const legPress = (reps: number, position: number) =>
      aSet('leg-press', 100, reps, toFailure, { id: `press-${position}`, position });
    const legsXpPerSet = (session: SessionInput) =>
      processSession(freshUser, session, flatCfg, { catalog: legPressCatalog }).outputs.sets.map(
        (result) => result.skillXp.find((part) => part.skillId === 'skill-legs')?.xp,
      );

    it('splits in proportion to each set and gives the leftover to the largest remainders', () => {
      const session: SessionInput = {
        id: 'spread',
        startedAt: '2026-09-28T10:00:00Z',
        sets: [legPress(4, 1), legPress(2, 2), legPress(2, 3)],
      };
      expect(legsXpPerSet(session)).toEqual([100, 50, 50]);
      expect(legsXpPerSet(withGear(session, ascendantBelt))).toEqual([103, 52, 52]);
    });

    it('breaks a remainder tie toward the lower set position', () => {
      const session: SessionInput = {
        id: 'tie',
        startedAt: '2026-09-28T10:00:00Z',
        sets: [legPress(2, 7), legPress(2, 3)],
      };
      expect(legsXpPerSet(session)).toEqual([50, 50]);
      expect(legsXpPerSet(withGear(session, ascendantBelt))).toEqual([52, 51]);
    });
  });

  it('applies to cardio XP as well', () => {
    const session: SessionInput = {
      id: 'run',
      startedAt: '2026-09-28T10:00:00Z',
      sets: [aBout('run', 1800, { type: 'cardio', level: 'hard' })],
    };
    const gearless = processSession(freshUser, session, TEST_BALANCE, { catalog });
    const geared = processSession(freshUser, withGear(session, fullAscendant), TEST_BALANCE, { catalog });
    const enduranceBase = gearless.outputs.xpBySkill.endurance;
    expect(enduranceBase).toBeGreaterThan(0);
    expect(geared.outputs.gearBonusBySkill).toEqual({ endurance: Math.round(enduranceBase / 10) });
    expect(geared.outputs.xpBySkill.endurance).toBe(enduranceBase + Math.round(enduranceBase / 10));
  });

  it('reports no bonus for a skill whose base XP alone reaches the XP cap', () => {
    const nearCap = { skillXp: { 'skill-legs': TEST_BALANCE.maxXp - 3 }, bodyweightKg: null };
    const { outputs } = processSession(nearCap, withGear(fixtureSession, ascendantBelt), TEST_BALANCE, { catalog });
    expect(outputs.xpBySkill.legs).toBe(3);
    expect(outputs.gearBonusBySkill).toEqual({ core: 2 });
  });

  it('reports only the bonus XP that fits above the base XP under the XP cap', () => {
    const legsBaseXp = 149;
    const nearCap = { skillXp: { 'skill-legs': TEST_BALANCE.maxXp - legsBaseXp - 2 }, bodyweightKg: null };
    const { outputs } = processSession(nearCap, withGear(fixtureSession, ascendantBelt), TEST_BALANCE, { catalog });
    expect(outputs.xpBySkill.legs).toBe(legsBaseXp + 2);
    expect(outputs.gearBonusBySkill).toEqual({ legs: 2, core: 2 });
  });

  it('never lowers XP, matches gearBonusXp per skill and is deterministic', () => {
    const lift = fc.record({
      exerciseId: fc.constantFrom('bench', 'squat', 'custom-press'),
      weightKg: fc.integer({ min: 0, max: 160 }),
      reps: fc.integer({ min: 1, max: 20 }),
      isWarmup: fc.boolean(),
      effort: fc.constantFrom<EffortInput>(null, hard, nearFailure, { type: 'rir', value: 2 }),
    });
    const bout = fc.record({
      exerciseId: fc.constantFrom('run', 'sprints', 'row-intervals'),
      durationS: fc.integer({ min: 60, max: 7200 }),
      effort: fc.constantFrom<EffortInput>(null, { type: 'cardio', level: 'hard' }),
    });
    const loadout = fc.dictionary(
      fc.constantFrom(...GEAR_SLOTS),
      fc.constantFrom('rookie', 'grinder', 'tempered', 'forged', 'titan', 'mythic', 'ascendant' as const),
    );
    fc.assert(
      fc.property(
        fc.array(lift, { maxLength: 10 }),
        fc.array(bout, { maxLength: 3 }),
        loadout,
        (lifts, bouts, gear) => {
          const sets: SessionInput['sets'] = [
            ...lifts.map((entry, index) => ({ ...entry, id: `lift-${index}`, position: index })),
            ...bouts.map((entry, index) => ({
              ...entry,
              kind: 'cardio' as const,
              id: `bout-${index}`,
              position: 100 + index,
              distanceM: null,
              interval: null,
            })),
          ];
          const session: SessionInput = { id: 'property', startedAt: '2026-09-28T10:00:00Z', sets };
          const gearless = processSession(freshUser, session, TEST_BALANCE, { catalog });
          const geared = processSession(freshUser, withGear(session, gear), TEST_BALANCE, { catalog });
          expect(processSession(freshUser, withGear(session, gear), TEST_BALANCE, { catalog })).toEqual(geared);
          for (const skill of catalog.skills) {
            const base = gearless.outputs.xpBySkill[skill.key] ?? 0;
            const bonus = gearBonusXp(base, skill.key, gear, TEST_BALANCE);
            expect(geared.outputs.xpBySkill[skill.key] ?? 0).toBe(base + bonus);
            expect(geared.outputs.gearBonusBySkill?.[skill.key] ?? 0).toBe(bonus);
          }
        },
      ),
    );
  });
});

describe('challenge bonus', () => {
  const singleSkillExercise = (id: string, skillKey: string): [string, ExerciseDef] => [
    id,
    { id, loadType: 'external', builtIn: true, shares: [{ skillId: `skill-${skillKey}`, shareBasisPoints: 10000 }] },
  ];
  const bonusCatalog: Catalog = {
    skills: catalog.skills,
    exercises: new Map([
      ...catalog.exercises,
      singleSkillExercise('leg-press', 'legs'),
      singleSkillExercise('core-press', 'core'),
      singleSkillExercise('chest-press', 'chest'),
    ]),
  };
  const flatCfg = {
    ...TEST_BALANCE,
    xpPerEffectiveRep: 25,
    intensityBonusStart: 2,
    intensityBonusFull: 3,
    fatiguePerHardSet: 0,
  };
  const toFailure = { type: 'rir', value: 0 } as const;
  let pressCounter = 0;
  const press = (exerciseId: string, reps: number) => {
    pressCounter += 1;
    return aSet(exerciseId, 100, reps, toFailure, { id: `${exerciseId}-${pressCounter}`, position: pressCounter });
  };
  const thousandXpOf = (exerciseId: string) => [0, 1, 2, 3, 4, 5, 6, 7].map(() => press(exerciseId, 5));
  const ascendantBelt: GearLoadout = { belt: 'ascendant' };
  const alwaysMet = (passing: boolean): ChallengeRun => ({
    challengeId: 'challenge-1',
    key: 'ten_ton_day',
    name: 'Ten-Ton Day',
    definition: { kind: 'volume', metric: 'kg', target: passing ? 1 : 1_000_000, exerciseId: null, minPct: null },
    e1rmKg: {},
  });
  const sessionOf = (sets: SessionInput['sets'], extra: Partial<SessionInput> = {}): SessionInput => ({
    id: 'challenge-session',
    startedAt: '2026-09-28T10:00:00Z',
    sets,
    ...extra,
  });
  const run = (session: SessionInput) => processSession(freshUser, session, flatCfg, { catalog: bonusCatalog });

  it('pays 25% of base XP on a pass with no gear', () => {
    const sets = thousandXpOf('core-press');
    expect(run(sessionOf(sets)).outputs.xpBySkill).toEqual({ core: 1000 });
    const { outputs } = run(sessionOf(sets, { challenge: alwaysMet(true) }));
    expect(outputs.xpBySkill).toEqual({ core: 1250 });
    expect(outputs.challengeBonusBySkill).toEqual({ core: 250 });
    expect(outputs.gearBonusBySkill).toBeUndefined();
    expect(outputs.challengeVerdict).toEqual({ passed: true });
    expect(outputs.sets.reduce((sum, result) => sum + result.xp, 0)).toBe(1000);
  });

  it('pays the challenge share on a skill that gets no gear bonus', () => {
    const { outputs } = run(
      sessionOf(thousandXpOf('chest-press'), { challenge: alwaysMet(true), gearLoadout: ascendantBelt }),
    );
    expect(outputs.xpBySkill).toEqual({ chest: 1250 });
    expect(outputs.challengeBonusBySkill).toEqual({ chest: 250 });
    expect(outputs.gearBonusBySkill?.chest).toBeUndefined();
  });

  it('adds the gear and challenge bonuses on base XP with an Ascendant belt', () => {
    const sets = [...thousandXpOf('core-press'), ...thousandXpOf('leg-press')];
    const { outputs } = run(sessionOf(sets, { challenge: alwaysMet(true), gearLoadout: ascendantBelt }));
    expect(outputs.xpBySkill).toEqual({ legs: 1283, core: 1350 });
    expect(outputs.gearBonusBySkill).toEqual({ legs: 33, core: 100 });
    expect(outputs.challengeBonusBySkill).toEqual({ legs: 250, core: 250 });
    expect(outputs.sets.reduce((sum, result) => sum + result.xp, 0)).toBe(2000);
  });

  describe('spreading both bonuses over the sets', () => {
    const legsXpPerSet = (session: SessionInput) =>
      run(session).outputs.sets.map((result) => result.skillXp.find((part) => part.skillId === 'skill-legs')?.xp);
    const legSets = () => [press('leg-press', 4), press('leg-press', 2), press('leg-press', 2)];

    it('spreads gear plus challenge once on a pass', () => {
      expect(legsXpPerSet(sessionOf(legSets(), { gearLoadout: ascendantBelt, challenge: alwaysMet(true) }))).toEqual([
        129, 64, 64,
      ]);
    });

    it('spreads only the gear bonus on a fail', () => {
      const failed = run(sessionOf(legSets(), { gearLoadout: ascendantBelt, challenge: alwaysMet(false) }));
      expect(failed.outputs.challengeVerdict).toEqual({ passed: false });
      expect(failed.outputs.challengeBonusBySkill).toBeUndefined();
      expect(
        failed.outputs.sets.map((result) => result.skillXp.find((part) => part.skillId === 'skill-legs')?.xp),
      ).toEqual([103, 52, 52]);
    });

    it('leaves a session without a challenge exactly as gear alone', () => {
      const sets = legSets();
      const gearOnly = run(sessionOf(sets, { gearLoadout: ascendantBelt }));
      expect(run(sessionOf(sets, { gearLoadout: ascendantBelt, challenge: null }))).toEqual(gearOnly);
      expect(legsXpPerSet(sessionOf(sets, { gearLoadout: ascendantBelt }))).toEqual([103, 52, 52]);
    });
  });

  it('clamps the challenge bonus first and gives gear what is left under the XP cap', () => {
    const nearCap = { skillXp: { 'skill-core': flatCfg.maxXp - 1000 - 300 }, bodyweightKg: null };
    const { outputs } = processSession(
      nearCap,
      sessionOf(thousandXpOf('core-press'), { challenge: alwaysMet(true), gearLoadout: ascendantBelt }),
      flatCfg,
      { catalog: bonusCatalog },
    );
    expect(outputs.xpBySkill).toEqual({ core: 1300 });
    expect(outputs.challengeBonusBySkill).toEqual({ core: 250 });
    expect(outputs.gearBonusBySkill).toEqual({ core: 50 });
  });

  it('matches base × (1 + 25%) plus the gear bonus per skill for any session', () => {
    const lift = fc.record({
      exerciseId: fc.constantFrom('bench', 'squat', 'custom-press'),
      weightKg: fc.integer({ min: 0, max: 160 }),
      reps: fc.integer({ min: 1, max: 20 }),
      isWarmup: fc.boolean(),
      effort: fc.constantFrom<EffortInput>(null, hard, nearFailure, { type: 'rir', value: 2 }),
    });
    const loadout = fc.dictionary(
      fc.constantFrom(...GEAR_SLOTS),
      fc.constantFrom('rookie', 'grinder', 'tempered', 'forged', 'titan', 'mythic', 'ascendant' as const),
    );
    fc.assert(
      fc.property(fc.array(lift, { maxLength: 10 }), loadout, (lifts, gear) => {
        const session = sessionOf(lifts.map((entry, index) => ({ ...entry, id: `lift-${index}`, position: index })));
        const plain = processSession(freshUser, session, TEST_BALANCE, { catalog });
        const boosted = processSession(
          freshUser,
          { ...session, gearLoadout: gear, challenge: alwaysMet(true) },
          TEST_BALANCE,
          { catalog },
        );
        const passed = boosted.outputs.challengeVerdict?.passed ?? false;
        for (const skill of catalog.skills) {
          const base = plain.outputs.xpBySkill[skill.key] ?? 0;
          const total =
            base +
            gearBonusXp(base, skill.key, gear, TEST_BALANCE) +
            (passed ? challengeBonusXp(base, TEST_BALANCE) : 0);
          expect(boosted.outputs.xpBySkill[skill.key] ?? 0).toBe(total);
        }
      }),
    );
  });
});
