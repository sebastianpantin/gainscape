import { describe, expect, it } from 'vitest';
import type { GarminActivity } from '@domain/index.ts';
import {
  activitiesToImport,
  allSelected,
  chosenCount,
  fileSummary,
  importButtonLabel,
  importProblemText,
  importStatusText,
  importSummary,
  initialChoices,
  lastImportText,
  type ReviewContext,
  type ReviewExercise,
  reviewMonths,
  reviewRange,
  type ReviewRow,
  reviewRows,
  rowBadge,
  rowFacts,
  rowTitle,
  withAllToggled,
  withExercisePicked,
  withRowToggled,
} from '../../web/src/lib/garmin/import-review-rules.ts';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const RUNNING: ReviewExercise = { id: 'ex-running', name: 'Running', tracksDistance: true, paceUnit: 'per_km' };
const SWIMMING: ReviewExercise = { id: 'ex-swimming', name: 'Swimming', tracksDistance: true, paceUnit: 'per_100m' };
const YOGA: ReviewExercise = { id: 'ex-yoga', name: 'Yoga', tracksDistance: false, paceUnit: 'per_km' };
const EXERCISES = new Map([RUNNING, SWIMMING, YOGA].map((exercise) => [exercise.id, exercise]));

function activity(overrides: Partial<GarminActivity> = {}): GarminActivity {
  return {
    type: 'running',
    startedAt: '2026-11-23T06:30:05.000Z',
    durationS: 1800,
    distanceM: 5000,
    laps: [],
    workoutSteps: [],
    ...overrides,
  };
}

function context(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    exerciseIdByGarminType: new Map([
      ['running', RUNNING.id],
      ['lap_swimming', SWIMMING.id],
    ]),
    seen: [],
    sessions: [],
    ...overrides,
  };
}

function reviewOf(activities: GarminActivity[], contextOverrides: Partial<ReviewContext> = {}) {
  const reviewContext = context(contextOverrides);
  const rows = reviewRows(activities, reviewContext, NOW);
  return { rows, reviewContext, choices: initialChoices(rows, reviewContext.sessions) };
}

const badgeTexts = (rows: ReviewRow[], review: ReturnType<typeof reviewOf>) =>
  rows.map((row) => rowBadge(row, review.choices, review.reviewContext.sessions)?.text ?? null);

describe('reviewRows', () => {
  it('lists the newest activity first', () => {
    const { rows } = reviewOf([
      activity({ startedAt: '2026-11-20T06:00:00.000Z' }),
      activity({ startedAt: '2026-11-23T06:00:00.000Z' }),
      activity({ startedAt: '2026-11-21T06:00:00.000Z' }),
    ]);
    expect(rows.map((row) => row.candidate.startedAt)).toEqual([
      '2026-11-23T06:00:00.000Z',
      '2026-11-21T06:00:00.000Z',
      '2026-11-20T06:00:00.000Z',
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
  });

  it('greys an activity the server has seen, with what happened to it', () => {
    const review = reviewOf(
      [
        activity({ startedAt: '2026-11-23T06:00:00.000Z' }),
        activity({ startedAt: '2026-11-22T06:00:00.000Z' }),
        activity({ startedAt: '2026-11-21T06:00:00.000Z' }),
        activity({ startedAt: '2026-11-20T06:00:00.000Z' }),
      ],
      {
        seen: [
          { startedAt: '2026-11-23T06:00:00.000Z', outcome: 'imported' },
          { startedAt: '2026-11-22T06:00:00.000Z', outcome: 'deleted' },
          { startedAt: '2026-11-21T06:00:00.000Z', outcome: 'rejected' },
        ],
      },
    );
    expect(review.rows.map((row) => row.greyed)).toEqual([
      'already_imported',
      'deleted_earlier',
      'rejected_earlier',
      null,
    ]);
    expect(badgeTexts(review.rows, review)).toEqual(['Already imported', 'Deleted earlier', 'Rejected earlier', null]);
  });

  it('greys what the mapping rejects, naming the limit', () => {
    const review = reviewOf([
      activity({ startedAt: '2026-11-23T06:00:00.000Z', durationS: 15_000 }),
      activity({ startedAt: '2026-11-22T06:00:00.000Z', distanceM: 250_000 }),
      activity({ startedAt: '2026-11-21T06:00:00.000Z', durationS: 20 }),
      activity({ startedAt: '2026-11-20T06:00:00.000Z', type: 'strength_training', distanceM: null }),
      activity({ startedAt: 'never' }),
    ]);
    expect(badgeTexts(review.rows, review)).toEqual([
      'Over 4 h',
      'Over 200 km',
      'Under 1 min',
      'Strength not imported yet',
      'Unreadable',
    ]);
    expect(review.rows.every((row) => row.greyed !== null)).toBe(true);
  });

  it('greys a second activity with the same start second', () => {
    const review = reviewOf([
      activity({ startedAt: '2026-11-23T06:00:00.200Z' }),
      activity({ startedAt: '2026-11-23T06:00:00.900Z', type: 'lap_swimming' }),
    ]);
    expect(review.rows.map((row) => row.greyed)).toEqual([null, 'same_start']);
    expect(badgeTexts(review.rows, review)[1]).toBe('Same start as another activity');
  });
});

describe('the default selection', () => {
  it('selects what can be imported as it is, history only included', () => {
    const review = reviewOf([activity(), activity({ startedAt: '2026-10-01T06:00:00.000Z' })]);
    expect(chosenCount(review.rows, review.choices)).toBe(2);
    expect(badgeTexts(review.rows, review)).toEqual([null, 'History only']);
    expect(allSelected(review.rows, review.choices)).toBe(true);
  });

  it('leaves a possible duplicate out: a logged workout of the same exercise whose time overlaps', () => {
    const sessions = [
      {
        id: 'session-1',
        startedAt: '2026-11-23T06:45:00.000Z',
        endedAt: '2026-11-23T07:30:00.000Z',
        exerciseIds: [RUNNING.id],
      },
    ];
    const review = reviewOf([activity()], { sessions });
    expect(chosenCount(review.rows, review.choices)).toBe(0);
    expect(rowBadge(review.rows[0], review.choices, sessions, 'UTC')).toEqual({
      kind: 'possible_duplicate',
      text: 'Possible duplicate',
      note: 'Matches a workout logged Mon 23 Nov, 06:45',
    });
    expect(allSelected(review.rows, review.choices)).toBe(false);
  });

  it.each([
    [
      'a workout that ended before the activity began',
      '2026-11-23T05:00:00.000Z',
      '2026-11-23T06:30:04.000Z',
      RUNNING.id,
    ],
    [
      'a workout that began after the activity ended',
      '2026-11-23T07:00:06.000Z',
      '2026-11-23T08:00:00.000Z',
      RUNNING.id,
    ],
    ['an overlapping workout of another exercise', '2026-11-23T06:45:00.000Z', '2026-11-23T07:30:00.000Z', SWIMMING.id],
  ])('does not call %s a duplicate', (_case, startedAt, endedAt, exerciseId) => {
    const sessions = [{ id: 'session-1', startedAt, endedAt, exerciseIds: [exerciseId] }];
    const review = reviewOf([activity()], { sessions });
    expect(chosenCount(review.rows, review.choices)).toBe(1);
    expect(rowBadge(review.rows[0], review.choices, sessions)).toBeNull();
  });

  it('counts a workout that touches the activity at one end as overlapping', () => {
    const sessions = [
      {
        id: 'session-1',
        startedAt: '2026-11-23T07:00:05.000Z',
        endedAt: '2026-11-23T08:00:00.000Z',
        exerciseIds: [RUNNING.id],
      },
    ];
    const review = reviewOf([activity()], { sessions });
    expect(rowBadge(review.rows[0], review.choices, sessions)?.kind).toBe('possible_duplicate');
  });

  it('leaves an activity without an exercise out until one is picked', () => {
    const review = reviewOf([activity({ type: 'surfing' })]);
    expect(chosenCount(review.rows, review.choices)).toBe(0);
    expect(badgeTexts(review.rows, review)).toEqual(['Needs an exercise']);
    const toggled = withRowToggled(review.rows, review.choices, review.rows[0].id, true);
    expect(chosenCount(review.rows, toggled)).toBe(0);

    const picked = withExercisePicked(review.rows, review.choices, [], review.rows[0].id, RUNNING.id);
    expect(chosenCount(review.rows, picked)).toBe(1);
    expect(rowBadge(review.rows[0], picked, [])).toBeNull();
  });

  it('keeps a picked exercise deselected when it makes the activity a possible duplicate', () => {
    const sessions = [
      {
        id: 'session-1',
        startedAt: '2026-11-23T06:45:00.000Z',
        endedAt: '2026-11-23T07:30:00.000Z',
        exerciseIds: [SWIMMING.id],
      },
    ];
    const review = reviewOf([activity({ type: 'surfing' })], { sessions });
    const picked = withExercisePicked(review.rows, review.choices, sessions, review.rows[0].id, SWIMMING.id);
    expect(chosenCount(review.rows, picked)).toBe(0);
    expect(rowBadge(review.rows[0], picked, sessions)?.kind).toBe('possible_duplicate');
    expect(chosenCount(review.rows, withRowToggled(review.rows, picked, review.rows[0].id, true))).toBe(1);
  });

  it('shows history only on an old activity once its exercise is picked', () => {
    const review = reviewOf([activity({ type: 'surfing', startedAt: '2026-10-01T06:00:00.000Z' })]);
    const picked = withExercisePicked(review.rows, review.choices, [], review.rows[0].id, RUNNING.id);
    expect(rowBadge(review.rows[0], picked, [])?.text).toBe('History only');
  });

  it('never selects a greyed activity', () => {
    const review = reviewOf([activity({ durationS: 15_000 })]);
    const forced = withRowToggled(review.rows, review.choices, review.rows[0].id, true);
    expect(chosenCount(review.rows, forced)).toBe(0);
    expect(allSelected(review.rows, forced)).toBe(false);
  });
});

describe('Select all', () => {
  const activities = [
    activity({ startedAt: '2026-11-23T06:00:00.000Z' }),
    activity({ startedAt: '2026-11-22T06:00:00.000Z', type: 'surfing' }),
    activity({ startedAt: '2026-11-21T06:00:00.000Z', durationS: 15_000 }),
    activity({ startedAt: '2026-11-20T06:00:00.000Z' }),
  ];
  const sessions = [
    {
      id: 'session-1',
      startedAt: '2026-11-20T06:10:00.000Z',
      endedAt: '2026-11-20T06:40:00.000Z',
      exerciseIds: [RUNNING.id],
    },
  ];

  it('selects every activity that has an exercise and is not greyed, possible duplicates too', () => {
    const review = reviewOf(activities, { sessions });
    expect(chosenCount(review.rows, review.choices)).toBe(1);
    const all = withAllToggled(review.rows, review.choices, true);
    expect(chosenCount(review.rows, all)).toBe(2);
    expect(allSelected(review.rows, all)).toBe(true);
  });

  it('clears the selection and keeps the picked exercises', () => {
    const review = reviewOf(activities, { sessions });
    const picked = withExercisePicked(review.rows, review.choices, sessions, review.rows[1].id, RUNNING.id);
    const none = withAllToggled(review.rows, picked, false);
    expect(chosenCount(review.rows, none)).toBe(0);
    expect(chosenCount(review.rows, withAllToggled(review.rows, none, true))).toBe(3);
  });
});

describe('the Import button', () => {
  it('counts the chosen workouts', () => {
    expect(importButtonLabel(0)).toBe('Import 0 workouts');
    expect(importButtonLabel(1)).toBe('Import 1 workout');
    expect(importButtonLabel(12)).toBe('Import 12 workouts');
  });
});

describe('activitiesToImport', () => {
  it('sends the chosen activities oldest first, each with its exercise and Cardio set values', () => {
    const review = reviewOf([
      activity({ startedAt: '2026-11-23T06:00:00.000Z', type: 'lap_swimming', durationS: 840, distanceM: 457.2 }),
      activity({ startedAt: '2026-11-21T06:00:00.000Z', durationS: 2400.4, distanceM: 7000 }),
      activity({ startedAt: '2026-11-22T06:00:00.000Z', durationS: 15_000 }),
    ]);
    expect(activitiesToImport(review.rows, review.choices, EXERCISES)).toEqual([
      {
        startedAt: '2026-11-21T06:00:00.000Z',
        garminType: 'running',
        exerciseId: RUNNING.id,
        durationS: 2400,
        distanceM: 7000,
        interval: null,
        historyOnly: false,
      },
      {
        startedAt: '2026-11-23T06:00:00.000Z',
        garminType: 'lap_swimming',
        exerciseId: SWIMMING.id,
        durationS: 840,
        distanceM: 457.2,
        interval: null,
        historyOnly: false,
      },
    ]);
  });

  it('drops the distance for a picked exercise that tracks none', () => {
    const review = reviewOf([activity({ type: 'yoga' })]);
    const picked = withExercisePicked(review.rows, review.choices, [], review.rows[0].id, YOGA.id);
    expect(activitiesToImport(review.rows, picked, EXERCISES)[0]).toMatchObject({
      garminType: 'yoga',
      exerciseId: YOGA.id,
      distanceM: null,
    });
  });

  it('leaves out a chosen activity whose exercise is gone', () => {
    const review = reviewOf([activity()]);
    expect(activitiesToImport(review.rows, review.choices, new Map())).toEqual([]);
  });
});

describe('reviewRange', () => {
  it('spans from the earliest start to the latest end of the readable activities', () => {
    const { rows } = reviewOf([
      activity({ startedAt: '2026-11-23T06:00:00.000Z', durationS: 3600 }),
      activity({ startedAt: '2026-11-20T06:00:00.000Z' }),
      activity({ startedAt: 'never' }),
    ]);
    expect(reviewRange(rows)).toEqual({ from: '2026-11-20T06:00:00.000Z', to: '2026-11-23T07:00:00.000Z' });
    expect(reviewRange(reviewOf([activity({ startedAt: 'never' })]).rows)).toBeNull();
  });
});

describe('how a row reads', () => {
  it('titles a row with its start and Garmin type', () => {
    const { rows } = reviewOf([
      activity({ type: 'treadmill_running' }),
      activity({ startedAt: '2026-11-22T18:05:00.000Z', type: null }),
      activity({ startedAt: 'never', type: 'running' }),
    ]);
    expect(rows.map((row) => rowTitle(row, 'UTC'))).toEqual([
      'Mon 23 Nov, 06:30 · Treadmill running',
      'Sun 22 Nov, 18:05 · Activity',
      'Running',
    ]);
  });

  it('states the exercise, the duration and the distance in the unit of the exercise', () => {
    const review = reviewOf([
      activity(),
      activity({ startedAt: '2026-11-22T06:00:00.000Z', type: 'lap_swimming', durationS: 840, distanceM: 457.2 }),
      activity({ startedAt: '2026-11-21T06:00:00.000Z', type: 'surfing', distanceM: null }),
    ]);
    expect(review.rows.map((row) => rowFacts(row, review.choices, EXERCISES, 'kg'))).toEqual([
      'Running · 30 min · 5 km',
      'Swimming · 14 min · 457 m',
      '30 min',
    ]);
    expect(rowFacts(review.rows[0], review.choices, EXERCISES, 'lb')).toBe('Running · 30 min · 3.11 mi');
  });

  it('adds the interval of a structured workout', () => {
    const review = reviewOf([
      activity({
        durationS: 860,
        workoutSteps: [
          { intensity: 'active', durationS: 60 },
          { intensity: 'rest', durationS: 30 },
        ],
        laps: [0, 1, 0, 1, 0].map((workoutStepIndex) => ({ workoutStepIndex })),
      }),
    ]);
    expect(rowFacts(review.rows[0], review.choices, EXERCISES, 'kg')).toBe(
      'Running · 14 min 20 s · 5 km · 3 × 1 min / 30 s rest',
    );
  });

  it('groups the rows by month, newest month first', () => {
    const { rows } = reviewOf([
      activity({ startedAt: '2026-11-23T06:00:00.000Z' }),
      activity({ startedAt: '2026-10-31T23:30:00.000Z' }),
      activity({ startedAt: '2026-11-01T00:30:00.000Z' }),
      activity({ startedAt: 'never' }),
    ]);
    expect(reviewMonths(rows, 'UTC').map((month) => [month.label, month.rows.length])).toEqual([
      ['November 2026', 2],
      ['October 2026', 1],
      ['Unknown date', 1],
    ]);
  });
});

describe('the import result', () => {
  it('sums what the server answered across chunks', () => {
    const summary = importSummary([
      { startedAt: 'a', outcome: 'imported', sessionId: 's1', xp: 120 },
      { startedAt: 'b', outcome: 'imported', sessionId: 's2', xp: 80 },
      { startedAt: 'c', outcome: 'history_only', sessionId: 's3' },
      { startedAt: 'd', outcome: 'skipped', reason: 'already_imported' },
      { startedAt: 'e', outcome: 'skipped', reason: 'daily_cap' },
    ]);
    expect(summary).toEqual({ scored: 2, xp: 200, historyOnly: 1, skipped: 2, hitDailyCap: true });
    expect(importStatusText(summary)).toBe(
      '2 workouts earned 200 XP · 1 saved as history only · 2 skipped. The daily limit of 500 imported workouts is reached; import the rest tomorrow.',
    );
  });

  it('says only what happened', () => {
    expect(importStatusText({ scored: 1, xp: 152, historyOnly: 0, skipped: 0, hitDailyCap: false })).toBe(
      '1 workout earned 152 XP.',
    );
    expect(importStatusText({ scored: 0, xp: 0, historyOnly: 3, skipped: 0, hitDailyCap: false })).toBe(
      '3 saved as history only.',
    );
    expect(importStatusText({ scored: 0, xp: 0, historyOnly: 0, skipped: 1, hitDailyCap: false })).toBe('1 skipped.');
    expect(importStatusText({ scored: 0, xp: 0, historyOnly: 0, skipped: 0, hitDailyCap: false })).toBe(
      'Nothing was imported.',
    );
  });
});

describe('importProblemText', () => {
  it('turns every failed answer into a sentence, never a code', () => {
    expect(importProblemText({ kind: 'needs_sign_in' })).toBe('Sign in again to import.');
    expect(importProblemText({ kind: 'wrong_account' })).toBe('Sign in again to import.');
    expect(importProblemText({ kind: 'retryable', reason: 'network_error' })).toBe(
      'Could not reach the server. Check your connection and try again.',
    );
    expect(importProblemText({ kind: 'http_error', status: 429, code: 'rate_limited', details: null })).toBe(
      'Too many requests in a short time. Wait a minute and try again.',
    );
    expect(importProblemText({ kind: 'http_error', status: 422, code: 'unknown_exercise', details: null })).toBe(
      'Could not import these workouts. Try again.',
    );
  });
});

describe('the text around the review', () => {
  it('names the file and counts its activities', () => {
    expect(fileSummary('morning-run.fit', 1)).toBe('morning-run.fit · 1 activity');
    expect(fileSummary('triathlon.fit', 3)).toBe('triathlon.fit · 3 activities');
  });

  it('says when the last import happened', () => {
    expect(lastImportText('2026-11-24T15:57:00.000Z', 'UTC')).toBe('Last import: Tue 24 Nov, 15:57');
  });
});
