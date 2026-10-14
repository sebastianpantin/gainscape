import { xpForLevel } from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import {
  canStartQuest,
  type QuestRows,
  questBoard,
  questExerciseIds,
  questLogFrom,
  questPointsText,
  questStepProgress,
  questStepText,
  startQuestProblemText,
  toCatalogQuest,
} from '../../web/src/lib/quests/quest-rules.ts';

const LEGS = { id: 'skill-legs', key: 'legs', name: 'Legs' };
const CORE = { id: 'skill-core', key: 'core', name: 'Core' };
const SKILLS = [LEGS, CORE];
const SQUAT = 'exercise-squat';
const NAMES = { [SQUAT]: 'Back Squat' };

const INITIATION = {
  id: 'quest-initiation',
  key: 'x_marks_the_squat',
  name: 'X Marks the Squat',
  description: 'Squat twice, then a hundred reps.',
  quest_points: 1,
  sort_order: 1,
  retired_at: null,
  definition: {
    steps: [
      { kind: 'sessions', target: 2, exerciseId: SQUAT },
      { kind: 'volume', metric: 'reps', target: 100, exerciseId: SQUAT },
    ],
    rewardXp: { [LEGS.id]: 800, [CORE.id]: 200 },
    requiredLevels: [],
    requiredQuestIds: [],
  },
};

const HEAVY_SINGLE = {
  id: 'quest-heavy',
  key: 'the_restless_squat',
  name: 'The Restless Squat',
  description: 'A record, then a heavy workout.',
  quest_points: 2,
  sort_order: 2,
  retired_at: null,
  definition: {
    steps: [
      { kind: 'record', exerciseId: SQUAT },
      {
        kind: 'workout',
        challenge: { kind: 'volume', metric: 'reps', target: 50, exerciseId: SQUAT, minPct: 70 },
      },
    ],
    rewardXp: { [LEGS.id]: 1500 },
    requiredLevels: [{ skillId: LEGS.id, level: 15 }],
    requiredQuestIds: [INITIATION.id],
  },
};

const OPEN_QUEST = {
  ...INITIATION,
  id: 'quest-open',
  key: 'open_quest',
  name: 'Open Quest',
  sort_order: 3,
  definition: { ...INITIATION.definition, steps: [{ kind: 'sessions', target: 3, exerciseId: null }] },
};

function rows(overrides: Partial<QuestRows> = {}): QuestRows {
  return {
    quests: [INITIATION, HEAVY_SINGLE, OPEN_QUEST],
    progress: [],
    completions: [],
    exerciseNames: NAMES,
    ...overrides,
  };
}

const LEVEL_10_XP = xpForLevel(10);

describe('toCatalogQuest', () => {
  it('reads a stored quest with its description and retirement', () => {
    const quest = toCatalogQuest({ ...INITIATION, retired_at: '2026-10-01T00:00:00Z' });
    expect(quest).toMatchObject({
      questId: INITIATION.id,
      key: INITIATION.key,
      name: INITIATION.name,
      questPoints: 1,
      description: INITIATION.description,
      retired: true,
      rewardXp: { [LEGS.id]: 800, [CORE.id]: 200 },
    });
    expect(quest?.steps).toHaveLength(2);
  });

  it('drops a quest whose stored definition it cannot read', () => {
    expect(toCatalogQuest({ ...INITIATION, definition: { steps: [] } })).toBeNull();
    expect(toCatalogQuest({ ...INITIATION, definition: 'broken' })).toBeNull();
  });
});

describe('questLogFrom', () => {
  it('sums the quest points of completed quests and reads progress numbers', () => {
    const log = questLogFrom(
      rows({
        progress: [{ quest_id: OPEN_QUEST.id, started_at: '2026-10-01T00:00:00Z', step_index: 0, step_progress: '2' }],
        completions: [
          { quest_id: INITIATION.id, completed_at: '2026-10-02T00:00:00Z', quest_points: 1 },
          { quest_id: HEAVY_SINGLE.id, completed_at: '2026-10-03T00:00:00Z', quest_points: 2 },
        ],
      }),
    );
    expect(log.questPoints).toBe(3);
    expect(log.completedQuestIds).toEqual([INITIATION.id, HEAVY_SINGLE.id]);
    expect(log.progress).toEqual([
      { questId: OPEN_QUEST.id, startedAt: '2026-10-01T00:00:00Z', stepIndex: 0, stepProgress: 2 },
    ]);
  });

  it('keeps the quests in their catalog order', () => {
    const log = questLogFrom(rows({ quests: [OPEN_QUEST, HEAVY_SINGLE, INITIATION] }));
    expect(log.quests.map((quest) => quest.key)).toEqual(['x_marks_the_squat', 'the_restless_squat', 'open_quest']);
  });
});

describe('questExerciseIds', () => {
  it('lists every exercise a quest step names once', () => {
    const log = questLogFrom(rows());
    expect(questExerciseIds(log.quests)).toEqual([SQUAT]);
  });
});

describe('questStepText', () => {
  const nameOf = (exerciseId: string) => NAMES[exerciseId as keyof typeof NAMES] ?? 'Exercise';

  it('describes each kind of step', () => {
    expect(questStepText({ kind: 'sessions', target: 2, exerciseId: SQUAT }, nameOf, 'kg')).toBe(
      'Train Back Squat in 2 workouts',
    );
    expect(questStepText({ kind: 'sessions', target: 1, exerciseId: null }, nameOf, 'kg')).toBe('Finish 1 workout');
    expect(questStepText({ kind: 'volume', metric: 'reps', target: 100, exerciseId: SQUAT }, nameOf, 'kg')).toBe(
      '100 reps of Back Squat in total',
    );
    expect(questStepText({ kind: 'volume', metric: 'kg', target: 20000, exerciseId: SQUAT }, nameOf, 'kg')).toBe(
      'Lift 20,000 kg of Back Squat in total',
    );
    expect(questStepText({ kind: 'volume', metric: 'kg', target: 1000, exerciseId: null }, nameOf, 'lb')).toBe(
      'Lift 2,205 lb in total',
    );
    expect(questStepText({ kind: 'record', exerciseId: SQUAT }, nameOf, 'kg')).toBe('Set a new Back Squat record');
    expect(questStepText({ kind: 'record', exerciseId: null }, nameOf, 'kg')).toBe('Set a new record');
  });

  it('describes a one-workout step with the challenge text', () => {
    const step = HEAVY_SINGLE.definition.steps[1] as Parameters<typeof questStepText>[0];
    expect(questStepText(step, nameOf, 'kg')).toBe('In one workout: 50 reps of Back Squat at 70% of your e1RM or more');
  });
});

describe('questStepProgress', () => {
  it('counts workouts and reps towards the target', () => {
    expect(questStepProgress({ kind: 'sessions', target: 3, exerciseId: null }, 1, 'kg')).toEqual({
      text: '1 / 3 workouts',
      fraction: 1 / 3,
    });
    expect(questStepProgress({ kind: 'volume', metric: 'reps', target: 100, exerciseId: null }, 42.5, 'kg')).toEqual({
      text: '42 / 100 reps',
      fraction: 0.425,
    });
  });

  it('shows lifted weight in the chosen unit', () => {
    expect(questStepProgress({ kind: 'volume', metric: 'kg', target: 1000, exerciseId: null }, 500, 'lb')).toEqual({
      text: '1,102 / 2,205 lb',
      fraction: 0.5,
    });
  });

  it('has no counter for a one-off step', () => {
    expect(questStepProgress({ kind: 'record', exerciseId: null }, 0, 'kg')).toBeNull();
  });
});

describe('questBoard', () => {
  it('groups quests by status in the order in progress, available, locked, completed', () => {
    const board = questBoard(
      questLogFrom(
        rows({
          quests: [INITIATION, HEAVY_SINGLE, OPEN_QUEST, { ...OPEN_QUEST, id: 'quest-done', name: 'Done Quest' }],
          progress: [{ quest_id: OPEN_QUEST.id, started_at: '2026-10-01T00:00:00Z', step_index: 0, step_progress: 1 }],
          completions: [{ quest_id: 'quest-done', completed_at: '2026-10-01T00:00:00Z', quest_points: 1 }],
        }),
      ),
      SKILLS,
      {},
      'kg',
    );
    expect(board.map((group) => [group.title, group.cards.map((card) => card.quest.name)])).toEqual([
      ['In progress', ['Open Quest']],
      ['Available', ['X Marks the Squat']],
      ['Locked', ['The Restless Squat']],
      ['Completed', ['Done Quest']],
    ]);
  });

  it('shows each requirement against your level and finished quests', () => {
    const board = questBoard(questLogFrom(rows()), SKILLS, { [LEGS.id]: LEVEL_10_XP }, 'kg');
    const heavy = board.flatMap((group) => group.cards).find((card) => card.quest.key === 'the_restless_squat');
    expect(heavy?.requirements).toEqual([
      { text: 'Legs level 15 (now 10)', met: false },
      { text: 'Complete X Marks the Squat', met: false },
    ]);
  });

  it('lists rewards and the quests a quest unlocks', () => {
    const board = questBoard(questLogFrom(rows()), SKILLS, {}, 'kg');
    const initiation = board.flatMap((group) => group.cards).find((card) => card.quest.key === INITIATION.key);
    expect(initiation?.rewards).toEqual(['1 quest point', '800 Legs XP', '200 Core XP']);
    expect(initiation?.unlocks).toEqual(['The Restless Squat']);
  });

  it('marks finished steps done and counts the current one', () => {
    const board = questBoard(
      questLogFrom(
        rows({
          progress: [
            { quest_id: INITIATION.id, started_at: '2026-10-01T00:00:00Z', step_index: 1, step_progress: '30.00' },
          ],
        }),
      ),
      SKILLS,
      {},
      'kg',
    );
    const initiation = board[0]?.cards[0];
    expect(initiation?.steps).toEqual([
      { text: 'Train Back Squat in 2 workouts', state: 'done', progress: null },
      {
        text: '100 reps of Back Squat in total',
        state: 'current',
        progress: { text: '30 / 100 reps', fraction: 0.3 },
      },
    ]);
  });

  it('shows every step of a completed quest as done', () => {
    const board = questBoard(
      questLogFrom(
        rows({ completions: [{ quest_id: INITIATION.id, completed_at: '2026-10-01T00:00:00Z', quest_points: 1 }] }),
      ),
      SKILLS,
      {},
      'kg',
    );
    const completed = board.find((group) => group.status === 'completed')?.cards[0];
    expect(completed?.steps.map((step) => step.state)).toEqual(['done', 'done']);
  });

  it('hides a retired quest you never started and keeps one you started or finished', () => {
    const retired = { retired_at: '2026-10-01T00:00:00Z' };
    const board = questBoard(
      questLogFrom(
        rows({
          quests: [
            { ...INITIATION, ...retired },
            { ...OPEN_QUEST, ...retired },
            { ...HEAVY_SINGLE, ...retired },
          ],
          progress: [{ quest_id: OPEN_QUEST.id, started_at: '2026-10-01T00:00:00Z', step_index: 0, step_progress: 0 }],
          completions: [{ quest_id: INITIATION.id, completed_at: '2026-10-01T00:00:00Z', quest_points: 1 }],
        }),
      ),
      SKILLS,
      {},
      'kg',
    );
    expect(board.flatMap((group) => group.cards.map((card) => card.quest.name))).toEqual([
      'Open Quest',
      'X Marks the Squat',
    ]);
  });
});

describe('canStartQuest', () => {
  it('starts only an available quest while online', () => {
    expect(canStartQuest('available', false)).toBe(true);
    expect(canStartQuest('available', true)).toBe(false);
    expect(canStartQuest('locked', false)).toBe(false);
    expect(canStartQuest('in_progress', false)).toBe(false);
    expect(canStartQuest('completed', false)).toBe(false);
  });
});

describe('questPointsText', () => {
  it('counts quest points', () => {
    expect(questPointsText(1)).toBe('1 quest point');
    expect(questPointsText(3)).toBe('3 quest points');
  });
});

describe('startQuestProblemText', () => {
  const names = {
    skillName: (skillId: string) => SKILLS.find((skill) => skill.id === skillId)?.name ?? 'a skill',
    questName: (questId: string) => (questId === INITIATION.id ? INITIATION.name : 'another quest'),
  };

  function httpError(code: string, details?: unknown, status = 409) {
    return { kind: 'http_error' as const, status, code, details };
  }

  it('names every missing requirement', () => {
    const missing = [
      { kind: 'missing_level', skillId: LEGS.id, level: 15, currentLevel: 3 },
      { kind: 'missing_quest', questId: INITIATION.id },
    ];
    expect(startQuestProblemText(httpError('quest_requirements_not_met', { missing }), names)).toBe(
      "You don't meet this quest's requirements yet: Legs level 15, complete X Marks the Squat.",
    );
    expect(startQuestProblemText(httpError('quest_requirements_not_met'), names)).toBe(
      "You don't meet this quest's requirements yet.",
    );
  });

  it('explains a gone or finished quest', () => {
    expect(startQuestProblemText(httpError('quest_not_found', undefined, 404), names)).toBe(
      'This quest is no longer available.',
    );
    expect(startQuestProblemText(httpError('quest_completed'), names)).toBe('You have already completed this quest.');
  });

  it('says when to try again after too many starts', () => {
    expect(startQuestProblemText(httpError('rate_limited', { retryAfterSeconds: 600 }, 429), names)).toBe(
      'Too many quests started. Try again in 10 min.',
    );
  });

  it('maps auth and network problems to a sentence', () => {
    expect(startQuestProblemText({ kind: 'retryable', reason: 'Failed to fetch' }, names)).toBe(
      "Couldn't reach the server. Check your connection and try again.",
    );
    expect(startQuestProblemText({ kind: 'needs_sign_in' }, names)).toBe(
      'Your sign-in expired. Sign in again to start this quest.',
    );
    expect(startQuestProblemText({ kind: 'wrong_account' }, names)).toBe(
      'You are signed in as someone else in another tab. Reload the app.',
    );
    expect(startQuestProblemText(httpError('internal_error', undefined, 500), names)).toBe(
      "Couldn't start the quest. Try again.",
    );
  });
});
