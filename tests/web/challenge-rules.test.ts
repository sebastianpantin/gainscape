import { type ChallengeDefinition, DEFAULT_ROUNDING, type StrengthState } from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import {
  type CatalogChallenge,
  challengeLoadKg,
  challengeSummaryText,
  challengeVolumeSoFarKg,
  challengeVolumeText,
  exercisesWithoutE1rm,
  mentionsE1rm,
  missingE1rmText,
  parsedChallengeDefinition,
  parsedDraftChallenge,
  toCatalogChallenge,
} from '../../web/src/lib/challenge-rules.ts';
import {
  addExercise,
  addSet,
  type CatalogEntry,
  type LiftDraftExercise,
  startDraftFromChallenge,
  updateSet,
  type WorkoutDraft,
} from '../../web/src/offline/draft-format.ts';

const NOW = new Date('2026-10-08T09:00:00.000Z');
const KG = DEFAULT_ROUNDING.kg;

const DEADLIFT_AND_PULL_UP: CatalogChallenge = {
  id: 'challenge-dl',
  key: 'deadlift_and_pull_up',
  name: 'Deadlift and Pull-up',
  definition: {
    kind: 'prescription',
    groups: [
      {
        rounds: 5,
        exercises: [
          { exerciseId: 'deadlift', reps: 5, pct: 70 },
          { exerciseId: 'pull_up', reps: 5, pct: null },
        ],
      },
    ],
  },
};

const SQUAT_CENTURY: CatalogChallenge = {
  id: 'challenge-sq',
  key: 'squat_century',
  name: 'Squat Century',
  definition: { kind: 'volume', metric: 'reps', target: 100, exerciseId: 'back_squat', minPct: 50 },
};

const TEN_TON_DAY: CatalogChallenge = {
  id: 'challenge-tt',
  key: 'ten_ton_day',
  name: 'Ten-Ton Day',
  definition: { kind: 'volume', metric: 'kg', target: 10000, exerciseId: null, minPct: null },
};

const EXERCISES = new Map<string, CatalogEntry>([
  ['deadlift', { name: 'Deadlift', archived: false, modality: 'lift', loadType: 'external' }],
  ['pull_up', { name: 'Pull-up', archived: false, modality: 'lift', loadType: 'bodyweight' }],
  ['back_squat', { name: 'Back Squat', archived: false, modality: 'lift', loadType: 'external' }],
]);

function strengthOf(e1rms: Record<string, number>): StrengthState {
  return Object.fromEntries(
    Object.entries(e1rms).map(([id, windowMax]) => [id, { windowMax, fallbackMax: null, hasPriorSession: true }]),
  );
}

function lifts(draft: WorkoutDraft): LiftDraftExercise[] {
  return draft.exercises.filter((exercise): exercise is LiftDraftExercise => exercise.modality === 'lift');
}

function setValues(exercise: LiftDraftExercise): [number, number][] {
  return exercise.sets.map((set) => [set.weightKg, set.reps]);
}

function startOf(challenge: CatalogChallenge, strength: StrengthState) {
  return startDraftFromChallenge(challenge, EXERCISES, strength, KG, 'kg', NOW).draft;
}

describe('challengeLoadKg', () => {
  it('rounds the exact target up to the next plate step', () => {
    expect(challengeLoadKg(98, KG, 'kg')).toBe(100);
    expect(challengeLoadKg(98.7, KG, 'kg')).toBe(100);
    expect(challengeLoadKg(97.5, KG, 'kg')).toBe(97.5);
  });

  it('never goes below the bar', () => {
    expect(challengeLoadKg(12, KG, 'kg')).toBe(20);
  });

  it('rounds up in pounds for a pound lifter and stores kilograms', () => {
    expect(challengeLoadKg(98, DEFAULT_ROUNDING.lb, 'lb')).toBe(99.79);
  });
});

describe('startDraftFromChallenge', () => {
  it('builds one superset of Deadlift and Pull-up with 5 rounds of 5 at 100 kg from an e1RM of 140', () => {
    const draft = startOf(DEADLIFT_AND_PULL_UP, strengthOf({ deadlift: 140 }));
    const [deadlift, pullUp] = lifts(draft);
    expect(draft.exercises).toHaveLength(2);
    expect(deadlift.name).toBe('Deadlift');
    expect(setValues(deadlift)).toEqual(Array.from({ length: 5 }, () => [100, 5]));
    expect(setValues(pullUp)).toEqual(Array.from({ length: 5 }, () => [0, 5]));
    expect(deadlift.supersetId).toEqual(expect.any(String));
    expect(pullUp.supersetId).toBe(deadlift.supersetId);
    expect([...deadlift.sets, ...pullUp.sets].every((set) => !set.done && !set.isWarmup)).toBe(true);
    expect(draft.challenge).toEqual({
      challengeId: 'challenge-dl',
      name: 'Deadlift and Pull-up',
      definition: DEADLIFT_AND_PULL_UP.definition,
      targetLoadsKg: { deadlift: 100, pull_up: null },
    });
    expect(draft.programLabel).toBe('Challenge — Deadlift and Pull-up');
    expect(draft.startedAt).toBe(NOW.toISOString());
  });

  it('rounds an e1RM of 141 up to 100 kg as well', () => {
    const [deadlift] = lifts(startOf(DEADLIFT_AND_PULL_UP, strengthOf({ deadlift: 141 })));
    expect(deadlift.sets[0].weightKg).toBe(100);
  });

  it('starts at 20 kg without an e1RM', () => {
    const draft = startOf(DEADLIFT_AND_PULL_UP, {});
    expect(lifts(draft)[0].sets[0].weightKg).toBe(20);
    expect(draft.challenge?.targetLoadsKg).toEqual({ deadlift: 20, pull_up: null });
  });

  it('uses the fallback max when the window has no e1RM', () => {
    const strength = { deadlift: { windowMax: null, fallbackMax: 140, hasPriorSession: true } };
    expect(lifts(startOf(DEADLIFT_AND_PULL_UP, strength))[0].sets[0].weightKg).toBe(100);
  });

  it('builds Squat Century as 10 sets of 10 at half the e1RM, without a superset', () => {
    const draft = startOf(SQUAT_CENTURY, strengthOf({ back_squat: 100 }));
    const [squat] = lifts(draft);
    expect(draft.exercises).toHaveLength(1);
    expect(setValues(squat)).toEqual(Array.from({ length: 10 }, () => [50, 10]));
    expect(squat.supersetId).toBeNull();
    expect(draft.challenge?.targetLoadsKg).toEqual({ back_squat: 50 });
  });

  it('builds Squat Century at 20 kg without an e1RM', () => {
    const [squat] = lifts(startOf(SQUAT_CENTURY, {}));
    expect(setValues(squat)).toEqual(Array.from({ length: 10 }, () => [20, 10]));
  });

  it('opens Ten-Ton Day empty with the challenge set', () => {
    const draft = startOf(TEN_TON_DAY, {});
    expect(draft.exercises).toEqual([]);
    expect(draft.challenge).toMatchObject({ challengeId: 'challenge-tt', targetLoadsKg: {} });
  });

  it('skips an exercise missing from the catalog and drops the superset it leaves alone', () => {
    const exercises = new Map(EXERCISES);
    exercises.delete('pull_up');
    const started = startDraftFromChallenge(DEADLIFT_AND_PULL_UP, exercises, {}, KG, 'kg', NOW);
    expect(started.skippedExerciseIds).toEqual(['pull_up']);
    expect(lifts(started.draft).map((exercise) => exercise.supersetId)).toEqual([null]);
  });
});

describe('challengeVolumeSoFarKg', () => {
  function liftedDraft(rounds: number, extra: (draft: WorkoutDraft) => WorkoutDraft = (draft) => draft) {
    let draft = startOf(TEN_TON_DAY, {});
    for (let index = 0; index < rounds; index++) {
      draft = addExercise(draft, `lift-${index}`, `Lift ${index}`, 'external');
      for (let set = 0; set < 5; set++) {
        draft = addSet(draft, index, { weightKg: 100, reps: 5 });
      }
    }
    return extra(draft);
  }

  it('adds up the done working sets: 4 × (5 × 5 @ 100) is 10,000 kg', () => {
    expect(challengeVolumeSoFarKg(liftedDraft(4))).toBe(10000);
  });

  it('leaves out warm-ups, sets not done and bodyweight', () => {
    const draft = liftedDraft(1, (lifted) => {
      const [exercise] = lifts(lifted);
      const warmup = updateSet(lifted, 0, exercise.sets[0].id, { isWarmup: true });
      const notDone = updateSet(warmup, 0, exercise.sets[1].id, { done: false });
      const withPullUps = addExercise(notDone, 'pull_up', 'Pull-up', 'bodyweight');
      return addSet(withPullUps, 1, { weightKg: 0, reps: 10 });
    });
    expect(challengeVolumeSoFarKg(draft)).toBe(1500);
  });

  it('counts the load added to a bodyweight lift: 20 kg × 5 weighted pull-ups is 100 kg', () => {
    const draft = liftedDraft(1, (lifted) => {
      const withWeightedPullUps = addExercise(lifted, 'weighted_pull_up', 'Weighted Pull-up', 'bodyweight_plus');
      return addSet(withWeightedPullUps, 1, { weightKg: 20, reps: 5 });
    });
    expect(challengeVolumeSoFarKg(draft)).toBe(2600);
  });

  it('shows the volume so far against the target in the lifter unit', () => {
    expect(challengeVolumeText(liftedDraft(1), 10000, 'kg')).toBe('Volume so far: 2,500 / 10,000 kg');
    expect(challengeVolumeText(liftedDraft(1), 10000, 'lb')).toBe('Volume so far: 5,512 / 22,046 lb');
  });
});

describe('exercisesWithoutE1rm', () => {
  it('lists each exercise with a load percent and no e1RM', () => {
    expect(exercisesWithoutE1rm(DEADLIFT_AND_PULL_UP.definition, {})).toEqual(['deadlift']);
    expect(exercisesWithoutE1rm(SQUAT_CENTURY.definition, strengthOf({ deadlift: 140 }))).toEqual(['back_squat']);
  });

  it('is empty once every percent exercise has an e1RM, from the window or the fallback', () => {
    expect(exercisesWithoutE1rm(DEADLIFT_AND_PULL_UP.definition, strengthOf({ deadlift: 140 }))).toEqual([]);
    const fallbackOnly: StrengthState = { back_squat: { windowMax: null, fallbackMax: 100, hasPriorSession: true } };
    expect(exercisesWithoutE1rm(SQUAT_CENTURY.definition, fallbackOnly)).toEqual([]);
  });

  it('is empty for a challenge without a load percent', () => {
    expect(exercisesWithoutE1rm(TEN_TON_DAY.definition, {})).toEqual([]);
  });
});

describe('missingE1rmText', () => {
  it('names the lifts to log first', () => {
    expect(missingE1rmText(['Deadlift'])).toBe('Log Deadlift first: this challenge sets its loads from your e1RM.');
    expect(missingE1rmText(['Front Squat', 'Romanian Deadlift'])).toBe(
      'Log Front Squat and Romanian Deadlift first: this challenge sets its loads from your e1RM.',
    );
  });
});

describe('parsing a challenge', () => {
  it('reads the stored definitions of every kind', () => {
    for (const challenge of [DEADLIFT_AND_PULL_UP, SQUAT_CENTURY, TEN_TON_DAY]) {
      expect(parsedChallengeDefinition(JSON.parse(JSON.stringify(challenge.definition)))).toEqual(challenge.definition);
    }
  });

  it.each([
    null,
    'prescription',
    { kind: 'timed' },
    { kind: 'prescription', groups: [{ rounds: '5', exercises: [] }] },
    { kind: 'volume', metric: 'miles', target: 1, exerciseId: null, minPct: null },
  ])('reads a malformed definition %j as null', (definition) => {
    expect(parsedChallengeDefinition(definition)).toBeNull();
  });

  it('maps a challenge row and drops one with a malformed definition', () => {
    const row = { id: 'challenge-dl', key: 'deadlift_and_pull_up', name: 'Deadlift and Pull-up' };
    expect(toCatalogChallenge({ ...row, definition: DEADLIFT_AND_PULL_UP.definition })).toEqual(DEADLIFT_AND_PULL_UP);
    expect(toCatalogChallenge({ ...row, definition: { kind: 'timed' } })).toBeNull();
  });

  it('reads a draft challenge and rejects a malformed one', () => {
    const planned = startOf(DEADLIFT_AND_PULL_UP, strengthOf({ deadlift: 140 })).challenge;
    expect(parsedDraftChallenge(JSON.parse(JSON.stringify(planned)))).toEqual(planned);
    expect(parsedDraftChallenge({ ...planned, challengeId: 7 })).toBeNull();
    expect(parsedDraftChallenge({ ...planned, targetLoadsKg: { deadlift: '100' } })).toBeNull();
    expect(parsedDraftChallenge({ ...planned, definition: { kind: 'timed' } })).toBeNull();
    expect(parsedDraftChallenge(undefined)).toBeNull();
  });
});

describe('challengeSummaryText', () => {
  const names: Record<string, string> = { deadlift: 'Deadlift', pull_up: 'Pull-up', back_squat: 'Back Squat' };
  const nameOf = (exerciseId: string) => names[exerciseId] ?? 'Exercise';

  it.each<[ChallengeDefinition, string]>([
    [DEADLIFT_AND_PULL_UP.definition, '5 rounds: Deadlift 5 reps at 70% of your e1RM, then Pull-up 5 reps'],
    [SQUAT_CENTURY.definition, '100 reps of Back Squat at 50% of your e1RM or more'],
    [TEN_TON_DAY.definition, 'Lift 10,000 kg in one workout'],
  ])('describes %j', (definition, text) => {
    expect(challengeSummaryText(definition, nameOf, 'kg')).toBe(text);
  });

  it('states a volume target in pounds for a lifter who uses pounds', () => {
    expect(challengeSummaryText(TEN_TON_DAY.definition, nameOf, 'lb')).toBe('Lift 22,046 lb in one workout');
  });
});

describe('mentionsE1rm', () => {
  const withoutPct: ChallengeDefinition = {
    kind: 'prescription',
    groups: [
      { rounds: 3, exercises: [{ exerciseId: 'pull_up', reps: 5, pct: null }] },
      { rounds: 2, exercises: [{ exerciseId: 'deadlift', reps: 3, pct: null }] },
    ],
  };
  const pctInLaterGroup: ChallengeDefinition = {
    kind: 'prescription',
    groups: [
      { rounds: 3, exercises: [{ exerciseId: 'pull_up', reps: 5, pct: null }] },
      { rounds: 2, exercises: [{ exerciseId: 'deadlift', reps: 3, pct: 80 }] },
    ],
  };

  it.each<[string, ChallengeDefinition, boolean]>([
    ['a prescription with a load percentage', DEADLIFT_AND_PULL_UP.definition, true],
    ['a prescription with a load percentage in a later group', pctInLaterGroup, true],
    ['a prescription without load percentages', withoutPct, false],
    ['a reps volume with a minimum load', SQUAT_CENTURY.definition, true],
    [
      'a reps volume at any load',
      { kind: 'volume', metric: 'reps', target: 100, exerciseId: null, minPct: null },
      false,
    ],
    [
      'a kg volume, even with a minimum load',
      { kind: 'volume', metric: 'kg', target: 5000, exerciseId: null, minPct: 50 },
      false,
    ],
  ])('says whether %s mentions e1RM', (_name, definition, mentions) => {
    expect(mentionsE1rm(definition)).toBe(mentions);
  });

  it('agrees with the summary text', () => {
    const definitions = [DEADLIFT_AND_PULL_UP, SQUAT_CENTURY, TEN_TON_DAY].map((challenge) => challenge.definition);
    for (const definition of [...definitions, withoutPct, pctInLaterGroup]) {
      expect(mentionsE1rm(definition)).toBe(challengeSummaryText(definition, (id) => id, 'kg').includes('e1RM'));
    }
  });
});
