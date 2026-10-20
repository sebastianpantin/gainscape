import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  advanceQuest,
  type PersonalRecordSummary,
  processSession,
  type QuestDefinition,
  questDefinitionFromStored,
  type QuestProgress,
  type QuestSessionFacts,
  type QuestStanding,
  questStartProblems,
  questStatus,
  type QuestStep,
  questsAfterSession,
  questsUnlockedBy,
  sessionCountsForQuest,
  type SetInput,
  stepGain,
  stepTarget,
  type StrengthState,
  xpForLevel,
} from '@domain/index.ts';
import { aBout, aHold, aSet, catalog, freshUser, hard, TEST_BALANCE } from './fixtures.ts';

const STARTED_AT = '2026-10-01T08:00:00.000Z';
const ENDED_AT = '2026-10-02T09:00:00.000Z';

const squatStrength: StrengthState = { squat: { windowMax: 100, fallbackMax: null, hasPriorSession: true } };

function factsFor(
  sets: SetInput[],
  overrides: Partial<Omit<QuestSessionFacts, 'sets'>> = {},
  strength: StrengthState = squatStrength,
): QuestSessionFacts {
  const session = { id: 'session-q', startedAt: '2026-10-02T08:00:00.000Z', sets };
  const { outputs } = processSession({ ...freshUser, bodyweightKg: 80 }, session, TEST_BALANCE, { catalog, strength });
  return { endedAt: ENDED_AT, sets: outputs.sets, strengthAtStart: strength, prs: [], ...overrides };
}

const squatPr: PersonalRecordSummary = {
  exerciseId: 'squat',
  kind: 'rep_max',
  setId: 'set-pr',
  reps: 5,
  loadKg: 120,
  previousLoadKg: 110,
  previousReps: null,
};

const runPr: PersonalRecordSummary = {
  kind: 'cardio',
  exerciseId: 'run',
  setId: 'bout-pr',
  records: [{ kind: 'distance', value: 5000, previous: 4000 }],
};

const twoSquatSessions: QuestStep = { kind: 'sessions', target: 2, exerciseId: 'squat' };
const hundredSquatReps: QuestStep = { kind: 'volume', metric: 'reps', target: 100, exerciseId: 'squat' };
const squatRecord: QuestStep = { kind: 'record', exerciseId: 'squat' };
const heavySquatWorkout: QuestStep = {
  kind: 'workout',
  challenge: { kind: 'volume', metric: 'reps', target: 50, exerciseId: 'squat', minPct: 70 },
};

const initiation: QuestDefinition = {
  questId: 'quest-initiation',
  key: 'x_marks_the_squat',
  name: 'X Marks the Squat',
  questPoints: 1,
  requiredLevels: [],
  requiredQuestIds: [],
  steps: [twoSquatSessions, hundredSquatReps],
  rewardXp: { 'skill-legs': 800, 'skill-core': 200 },
};

const heavySingle: QuestDefinition = {
  questId: 'quest-heavy-single',
  key: 'the_restless_squat',
  name: 'The Restless Squat',
  questPoints: 2,
  requiredLevels: [{ skillId: 'skill-legs', level: 15 }],
  requiredQuestIds: ['quest-initiation'],
  steps: [squatRecord, heavySquatWorkout],
  rewardXp: { 'skill-legs': 1500, 'skill-back': 300 },
};

const noStanding: QuestStanding = { skillXp: {}, completedQuestIds: [], startedQuestIds: [] };

const progressAt = (stepIndex: number, stepProgress = 0, startedAt = STARTED_AT): QuestProgress => ({
  questId: initiation.questId,
  startedAt,
  stepIndex,
  stepProgress,
});

const squatTens = (count: number, weightKg = 70) =>
  Array.from({ length: count }, () => aSet('squat', weightKg, 10, hard));

describe('questStartProblems', () => {
  it('lets anyone start a quest with no requirements', () => {
    expect(questStartProblems(initiation, noStanding)).toEqual([]);
  });

  it('lists every missing level and quest', () => {
    expect(questStartProblems(heavySingle, { ...noStanding, skillXp: { 'skill-legs': xpForLevel(14) } })).toEqual([
      { kind: 'missing_level', skillId: 'skill-legs', level: 15, currentLevel: 14 },
      { kind: 'missing_quest', questId: 'quest-initiation' },
    ]);
  });

  it('accepts a skill exactly at the required level', () => {
    const standing = {
      skillXp: { 'skill-legs': xpForLevel(15) },
      completedQuestIds: ['quest-initiation'],
      startedQuestIds: [],
    };
    expect(questStartProblems(heavySingle, standing)).toEqual([]);
  });

  it('refuses a quest already started or completed', () => {
    expect(questStartProblems(initiation, { ...noStanding, startedQuestIds: ['quest-initiation'] })).toEqual([
      { kind: 'already_started' },
    ]);
    expect(questStartProblems(initiation, { ...noStanding, completedQuestIds: ['quest-initiation'] })).toEqual([
      { kind: 'already_completed' },
    ]);
  });
});

describe('questStatus', () => {
  it('is locked while a requirement is missing and available once all are met', () => {
    expect(questStatus(heavySingle, noStanding)).toBe('locked');
    expect(
      questStatus(heavySingle, {
        skillXp: { 'skill-legs': xpForLevel(20) },
        completedQuestIds: ['quest-initiation'],
        startedQuestIds: [],
      }),
    ).toBe('available');
  });

  it('is in progress once started, even if a requirement is no longer met', () => {
    expect(questStatus(heavySingle, { ...noStanding, startedQuestIds: ['quest-heavy-single'] })).toBe('in_progress');
  });

  it('lets completion win over everything else', () => {
    expect(
      questStatus(heavySingle, {
        ...noStanding,
        startedQuestIds: ['quest-heavy-single'],
        completedQuestIds: ['quest-heavy-single'],
      }),
    ).toBe('completed');
  });
});

describe('questsUnlockedBy', () => {
  it('lists the quests that turn from locked to available, in the given order', () => {
    const before = { skillXp: { 'skill-legs': xpForLevel(14) }, completedQuestIds: [], startedQuestIds: [] };
    const after = {
      skillXp: { 'skill-legs': xpForLevel(15) },
      completedQuestIds: ['quest-initiation'],
      startedQuestIds: [],
    };
    expect(questsUnlockedBy([initiation, heavySingle], before, after)).toEqual(['quest-heavy-single']);
    expect(questsUnlockedBy([initiation, heavySingle], before, before)).toEqual([]);
  });
});

describe('stepTarget', () => {
  it('is 1 for a workout or a record and the target otherwise', () => {
    expect([twoSquatSessions, hundredSquatReps, squatRecord, heavySquatWorkout].map(stepTarget)).toEqual([
      2, 100, 1, 1,
    ]);
  });
});

describe('sessionCountsForQuest', () => {
  it('counts only a session that ended strictly after the quest started', () => {
    expect(sessionCountsForQuest(progressAt(0), '2026-10-01T08:00:00.001Z')).toBe(true);
    expect(sessionCountsForQuest(progressAt(0), STARTED_AT)).toBe(false);
    expect(sessionCountsForQuest(progressAt(0), '2026-09-30T08:00:00.000Z')).toBe(false);
  });
});

describe('stepGain', () => {
  it('counts a session with a working set of the exercise', () => {
    expect(stepGain(twoSquatSessions, factsFor([aSet('squat', 60, 5, hard)]))).toBe(1);
    expect(stepGain(twoSquatSessions, factsFor([aSet('squat', 40, 5, hard, { isWarmup: true })]))).toBe(0);
    expect(stepGain(twoSquatSessions, factsFor([aSet('bench', 60, 5, hard)]))).toBe(0);
  });

  it('counts any working set, of any kind, for a sessions step with no exercise', () => {
    const anyExercise: QuestStep = { kind: 'sessions', target: 3, exerciseId: null };
    expect(stepGain(anyExercise, factsFor([aBout('stretch', 600, null)]))).toBe(1);
    expect(stepGain(anyExercise, factsFor([aHold('dead-hang', 0, { durationS: 30 }, hard)]))).toBe(1);
    expect(stepGain(anyExercise, factsFor([aSet('bench', 20, 5, hard, { isWarmup: true })]))).toBe(0);
  });

  it('adds working reps of the exercise for a volume step', () => {
    const sets = [...squatTens(3), aSet('squat', 40, 10, hard, { isWarmup: true }), aSet('bench', 60, 10, hard)];
    expect(stepGain(hundredSquatReps, factsFor(sets))).toBe(30);
  });

  it('adds kg as weight times reps, rounded to 2 decimals', () => {
    const kgStep: QuestStep = { kind: 'volume', metric: 'kg', target: 20000, exerciseId: null };
    expect(stepGain(kgStep, factsFor([aSet('squat', 101.25, 5, hard), aSet('bench', 60, 3, hard)]))).toBe(686.25);
  });

  it('pays 1 for a record on the exercise, lift or cardio, or on anything when none is named', () => {
    expect(stepGain(squatRecord, factsFor([], { prs: [squatPr] }))).toBe(1);
    expect(stepGain(squatRecord, factsFor([], { prs: [runPr] }))).toBe(0);
    expect(stepGain({ kind: 'record', exerciseId: 'run' }, factsFor([], { prs: [runPr] }))).toBe(1);
    expect(stepGain({ kind: 'record', exerciseId: null }, factsFor([], { prs: [runPr] }))).toBe(1);
    expect(stepGain({ kind: 'record', exerciseId: null }, factsFor([]))).toBe(0);
  });

  it('judges a workout step against the e1RM at session start', () => {
    expect(stepGain(heavySquatWorkout, factsFor(squatTens(5)))).toBe(1);
    expect(stepGain(heavySquatWorkout, factsFor(squatTens(5, 65)))).toBe(0);
    expect(stepGain(heavySquatWorkout, factsFor(squatTens(4)))).toBe(0);
    expect(stepGain(heavySquatWorkout, factsFor(squatTens(5), {}, {}))).toBe(0);
  });
});

describe('advanceQuest', () => {
  it('leaves the quest unchanged for a session that ended before it started', () => {
    const facts = factsFor([aSet('squat', 60, 5, hard)], { endedAt: '2026-09-30T08:00:00.000Z' });
    expect(advanceQuest(initiation, progressAt(0), facts)).toEqual({ outcome: 'unchanged' });
  });

  it('leaves the quest unchanged when the session adds nothing', () => {
    expect(advanceQuest(initiation, progressAt(0), factsFor([aSet('bench', 60, 5, hard)]))).toEqual({
      outcome: 'unchanged',
    });
  });

  it('adds progress within a step', () => {
    expect(advanceQuest(initiation, progressAt(0), factsFor([aSet('squat', 60, 5, hard)]))).toEqual({
      outcome: 'progressed',
      progress: progressAt(0, 1),
    });
  });

  it('moves to the next step and discards the surplus', () => {
    expect(advanceQuest(initiation, progressAt(0, 1), factsFor(squatTens(10)))).toEqual({
      outcome: 'progressed',
      progress: progressAt(1, 0),
    });
  });

  it('advances at most one step per session', () => {
    const twoStep = { ...initiation, steps: [hundredSquatReps, twoSquatSessions] };
    expect(advanceQuest(twoStep, progressAt(0, 90), factsFor(squatTens(12)))).toEqual({
      outcome: 'progressed',
      progress: progressAt(1, 0),
    });
  });

  it('completes on the last step', () => {
    expect(advanceQuest(initiation, progressAt(1, 70), factsFor(squatTens(3)))).toEqual({ outcome: 'completed' });
  });

  it('completes a quest whose stored step index is past its last step', () => {
    expect(advanceQuest(initiation, progressAt(2), factsFor([aSet('bench', 60, 5, hard)]))).toEqual({
      outcome: 'completed',
    });
  });

  it('keeps the step index within the steps and progress below the step target', () => {
    fc.assert(
      fc.property(
        fc.nat(1),
        fc.integer({ min: 0, max: 99 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 15 }), fc.boolean()), {
          maxLength: 10,
        }),
        (stepIndex, done, drafts) => {
          const stepProgress = Math.min(done, stepTarget(initiation.steps[stepIndex]) - 1);
          const sets = drafts.map(([steps, reps, isWarmup]) => aSet('squat', steps * 2.5, reps, hard, { isWarmup }));
          const result = advanceQuest(initiation, progressAt(stepIndex, stepProgress), factsFor(sets));
          fc.pre(result.outcome === 'progressed');
          const { progress } = result;
          expect(progress.stepIndex).toBeGreaterThanOrEqual(stepIndex);
          expect(progress.stepIndex).toBeLessThanOrEqual(stepIndex + 1);
          expect(progress.stepIndex).toBeLessThan(initiation.steps.length);
          expect(progress.stepProgress).toBeGreaterThanOrEqual(0);
          expect(progress.stepProgress).toBeLessThan(stepTarget(initiation.steps[progress.stepIndex]));
          if (progress.stepIndex === stepIndex) expect(progress.stepProgress).toBeGreaterThan(stepProgress);
          else expect(progress.stepProgress).toBe(0);
        },
      ),
    );
  });
});

describe('questDefinitionFromStored', () => {
  const identity = {
    questId: heavySingle.questId,
    key: heavySingle.key,
    name: heavySingle.name,
    questPoints: heavySingle.questPoints,
  };
  const stored = {
    requiredLevels: [{ skillId: 'skill-legs', level: 15 }],
    requiredQuestIds: ['quest-initiation'],
    steps: [
      { kind: 'record', exerciseId: 'squat' },
      {
        kind: 'workout',
        challenge: { kind: 'volume', metric: 'reps', target: 50, exerciseId: 'squat', minPct: 70 },
      },
    ],
    rewardXp: { 'skill-legs': 1500, 'skill-back': 300 },
  };

  it('round-trips a definition through JSON', () => {
    expect(questDefinitionFromStored(identity, JSON.parse(JSON.stringify(stored)))).toEqual(heavySingle);
  });

  it('reads a null exercise for volume, record and sessions steps', () => {
    const steps = [
      { kind: 'volume', metric: 'kg', target: 20000, exerciseId: null },
      { kind: 'record', exerciseId: null },
      { kind: 'sessions', target: 3, exerciseId: null },
    ];
    expect(questDefinitionFromStored(identity, { ...stored, steps }).steps).toEqual(steps);
  });

  it.each([
    ['a non-object definition', 'nope'],
    ['no steps', { ...stored, steps: [] }],
    ['an unknown step kind', { ...stored, steps: [{ kind: 'dance' }] }],
    ['a bad volume metric', { ...stored, steps: [{ kind: 'volume', metric: 'miles', target: 1, exerciseId: null }] }],
    ['a non-positive target', { ...stored, steps: [{ kind: 'sessions', target: 0, exerciseId: null }] }],
    ['a malformed challenge', { ...stored, steps: [{ kind: 'workout', challenge: { kind: 'nope' } }] }],
    ['a non-string required quest', { ...stored, requiredQuestIds: [7] }],
    ['a malformed level', { ...stored, requiredLevels: [{ skillId: 'skill-legs', level: 'high' }] }],
    ['a non-integer reward', { ...stored, rewardXp: { 'skill-legs': 1.5 } }],
    ['a negative reward', { ...stored, rewardXp: { 'skill-legs': -1 } }],
  ])('rejects %s', (_label, value) => {
    expect(() => questDefinitionFromStored(identity, value)).toThrow(RangeError);
  });
});

describe('questsAfterSession', () => {
  const legsGate: QuestDefinition = {
    questId: 'quest-legs-gate',
    key: 'legs_gate',
    name: 'Legs Gate',
    questPoints: 1,
    requiredLevels: [{ skillId: 'skill-legs', level: 15 }],
    requiredQuestIds: [],
    steps: [twoSquatSessions],
    rewardXp: { 'skill-legs': 100 },
  };
  const board = { quests: [initiation, heavySingle, legsGate], retiredQuestIds: [] };
  const sessionFacts = (sets: SetInput[]) => factsFor(sets);
  const noXp = { skillXpBeforeSync: {}, skillXpAfterSync: {} };

  it('changes nothing and writes no summary when no quest moves or unlocks', () => {
    const outcome = questsAfterSession(
      { ...board, ...noXp, progress: [], completedQuestIds: [], facts: sessionFacts([aSet('squat', 60, 5, hard)]) },
      catalog,
      TEST_BALANCE,
    );
    expect(outcome).toEqual({ progressed: [], completions: [], skillXp: {}, summary: null });
  });

  it('records progress within a step with the target of the step it is on', () => {
    const outcome = questsAfterSession(
      {
        ...board,
        ...noXp,
        progress: [progressAt(0)],
        completedQuestIds: [],
        facts: sessionFacts([aSet('squat', 60, 5, hard)]),
      },
      catalog,
      TEST_BALANCE,
    );
    expect(outcome.progressed).toEqual([progressAt(0, 1)]);
    expect(outcome.summary).toEqual({
      completed: [],
      progressed: [{ questId: initiation.questId, stepIndex: 0, stepProgress: 1, stepTarget: 2 }],
      unlocked: [],
      levelUps: [],
    });
  });

  it('leaves a quest that the session does not move out of the summary', () => {
    const outcome = questsAfterSession(
      {
        ...board,
        ...noXp,
        progress: [progressAt(0)],
        completedQuestIds: [],
        facts: sessionFacts([aSet('bench', 60, 5, hard)]),
      },
      catalog,
      TEST_BALANCE,
    );
    expect(outcome).toEqual({ progressed: [], completions: [], skillXp: {}, summary: null });
  });

  it('grants the reward on completion with the level-ups it causes and the quests it unlocks', () => {
    const skillXp = { 'skill-legs': xpForLevel(15) - 100 };
    const outcome = questsAfterSession(
      {
        ...board,
        skillXpBeforeSync: skillXp,
        skillXpAfterSync: skillXp,
        progress: [progressAt(1, 70)],
        completedQuestIds: [],
        facts: sessionFacts(squatTens(3)),
      },
      catalog,
      TEST_BALANCE,
    );
    const levelUps = [
      { skill: 'legs', from: 14, to: 18 },
      { skill: 'core', from: 1, to: 3 },
    ];
    expect(outcome.completions).toEqual([
      { quest: initiation, startedAt: STARTED_AT, xpBySkill: { 'skill-legs': 800, 'skill-core': 200 }, levelUps },
    ]);
    expect(outcome.skillXp).toEqual({ 'skill-legs': xpForLevel(15) + 700, 'skill-core': 200 });
    expect(outcome.progressed).toEqual([]);
    expect(outcome.summary).toEqual({
      completed: [
        {
          questId: initiation.questId,
          key: initiation.key,
          name: initiation.name,
          questPoints: 1,
          xpBySkill: { 'skill-legs': 800, 'skill-core': 200 },
        },
      ],
      progressed: [],
      unlocked: [heavySingle.questId, legsGate.questId],
      levelUps,
    });
  });

  it('caps granted xp at the maximum and counts level-ups from the running total', () => {
    const second = { ...legsGate, questId: 'quest-second', requiredLevels: [], rewardXp: { 'skill-legs': 900 } };
    const secondProgress = { ...progressAt(0, 1), questId: second.questId };
    const cappedBalance = { ...TEST_BALANCE, maxXp: xpForLevel(18) + 100 };
    const skillXp = { 'skill-legs': xpForLevel(15) - 100 };
    const outcome = questsAfterSession(
      {
        quests: [initiation, second],
        retiredQuestIds: [],
        skillXpBeforeSync: skillXp,
        skillXpAfterSync: skillXp,
        progress: [progressAt(1, 70), secondProgress],
        completedQuestIds: [],
        facts: sessionFacts(squatTens(3)),
      },
      catalog,
      cappedBalance,
    );
    const initiationLevelUps = [
      { skill: 'legs', from: 14, to: 18 },
      { skill: 'core', from: 1, to: 3 },
    ];
    expect(outcome.completions.map((completion) => completion.levelUps)).toEqual([initiationLevelUps, []]);
    expect(outcome.skillXp['skill-legs']).toBe(cappedBalance.maxXp);
    expect(outcome.summary?.levelUps).toEqual(initiationLevelUps);
  });

  it('reports a quest unlocked by the session xp alone but never a retired one', () => {
    const facts = sessionFacts([aSet('bench', 60, 5, hard)]);
    const input = {
      ...board,
      skillXpBeforeSync: { 'skill-legs': xpForLevel(14) },
      skillXpAfterSync: { 'skill-legs': xpForLevel(15) },
      progress: [],
      completedQuestIds: [],
      facts,
    };
    expect(questsAfterSession(input, catalog, TEST_BALANCE).summary).toEqual({
      completed: [],
      progressed: [],
      unlocked: [legsGate.questId],
      levelUps: [],
    });
    expect(
      questsAfterSession({ ...input, retiredQuestIds: [legsGate.questId] }, catalog, TEST_BALANCE).summary,
    ).toBeNull();
  });

  it('keeps advancing a started quest after it is retired', () => {
    const outcome = questsAfterSession(
      {
        ...board,
        ...noXp,
        retiredQuestIds: [initiation.questId],
        progress: [progressAt(0)],
        completedQuestIds: [],
        facts: sessionFacts([aSet('squat', 60, 5, hard)]),
      },
      catalog,
      TEST_BALANCE,
    );
    expect(outcome.progressed).toEqual([progressAt(0, 1)]);
  });
});
