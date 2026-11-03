import { describe, expect, it } from 'vitest';
import { type PrescribedExercise, resolvePrescription } from '@domain/index.ts';
import { initialProgramState } from '@domain/program-state.ts';
import { MADCOW_5X5, madcowEnrollment, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';
import { addExercise, insertWarmupDrills, removeExercise, toggleSetDone } from '../../web/src/offline/draft-edits.ts';
import {
  canAddSecondDay,
  dayDrafts,
  dayNameOf,
  labelledDays,
  draftTitle,
  exerciseDay,
  restoreSecondDay,
  withoutSecondDay,
  withSecondDay,
} from '../../web/src/offline/draft-days.ts';
import { parseStoredDraft, type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import {
  type CatalogEntry,
  type PrescribedDayStart,
  startDraftFromPrescription,
} from '../../web/src/offline/draft-starts.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';
import { exerciseMenuChoices } from '../../web/src/features/workout/exercise-card-rules.ts';

const enrollment = madcowEnrollment();
const STARTED_AT = new Date('2026-10-05T06:00:00.000Z');
const SECOND_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const userId = '11111111-1111-4111-8111-111111111111';

function dayStart(day: 'mon' | 'wed', dayName: string): PrescribedDayStart {
  const exercises = resolvePrescription(
    MADCOW_5X5,
    enrollment,
    initialProgramState(MADCOW_5X5, enrollment),
    weekDay(1, day),
    {},
  ).filter((slot): slot is PrescribedExercise => slot.kind === 'exercise');
  return {
    enrollmentId: enrollment.id,
    templateKey: 'madcow_5x5',
    programName: 'Madcow 5x5',
    dayName,
    position: weekDay(1, day),
    exercises,
  };
}

const MONDAY = dayStart('mon', 'W1 Day 1');
const WEDNESDAY = dayStart('wed', 'W1 Day 2');
const catalog = new Map<string, CatalogEntry>(
  [...MONDAY.exercises, ...WEDNESDAY.exercises].map((slot) => [
    slot.exerciseId,
    { name: slot.lift, loadType: 'external', archived: false },
  ]),
);

function monday(): WorkoutDraft {
  return startDraftFromPrescription(MONDAY, catalog, STARTED_AT).draft;
}

function mondayAndWednesday(): WorkoutDraft {
  return withSecondDay(monday(), WEDNESDAY, catalog, SECOND_SESSION_ID).draft;
}

function secondDayCount(draft: WorkoutDraft): number {
  return draft.exercises.filter((_, index) => exerciseDay(draft, index) === 'second').length;
}

describe('canAddSecondDay', () => {
  it('lets a Draft started from a Day take one more Day', () => {
    expect(canAddSecondDay(monday())).toBe(true);
    expect(canAddSecondDay(mondayAndWednesday())).toBe(false);
  });

  it('refuses a freestyle, challenge or finished Draft', () => {
    const draft = monday();
    expect(canAddSecondDay({ ...draft, program: null })).toBe(false);
    expect(canAddSecondDay({ ...draft, finishedAt: '2026-10-05T07:00:00.000Z' })).toBe(false);
  });
});

describe('withSecondDay', () => {
  it('appends the second Day after the first and links it to its own Session', () => {
    const first = monday();
    const both = mondayAndWednesday();
    expect(both.exercises.slice(0, first.exercises.length).map((exercise) => exercise.exerciseId)).toEqual(
      first.exercises.map((exercise) => exercise.exerciseId),
    );
    expect(secondDayCount(both)).toBe(both.exercises.length - first.exercises.length);
    expect(secondDayCount(both)).toBeGreaterThan(0);
    expect(both.secondDay).toEqual({
      sessionId: SECOND_SESSION_ID,
      program: { enrollmentId: enrollment.id, position: weekDay(1, 'wed'), templateKey: 'madcow_5x5' },
      programLabel: 'Madcow 5x5 — W1 Day 2',
    });
  });

  it('refuses the Day already in the Draft and a Day of another Enrollment', () => {
    const draft = monday();
    expect(withSecondDay(draft, MONDAY, catalog, SECOND_SESSION_ID).draft).toBe(draft);
    expect(withSecondDay(draft, { ...WEDNESDAY, enrollmentId: 'other' }, catalog, SECOND_SESSION_ID).draft).toBe(draft);
  });

  it('puts exercises added by hand afterwards into the second Day', () => {
    const both = addExercise(mondayAndWednesday(), 'curl', 'Curl', 'external');
    expect(exerciseDay(both, both.exercises.length - 1)).toBe('second');
    expect(exerciseDay(addExercise(monday(), 'curl', 'Curl', 'external'), 0)).toBe('first');
  });

  it('gives warm-up drills the Day of the exercise they go before', () => {
    const both = mondayAndWednesday();
    const firstOfSecondDay = both.exercises.findIndex((_, index) => exerciseDay(both, index) === 'second');
    const drill = {
      id: 'jog',
      name: 'Jog',
      activity: {
        paceUnit: 'per_km' as const,
        referencePaceSPerKm: 360,
        maxEffort: 'max' as const,
        tracksDistance: true,
        shares: [],
      },
    };
    const withDrill = insertWarmupDrills(both, firstOfSecondDay, [drill]);
    expect(exerciseDay(withDrill, firstOfSecondDay)).toBe('second');
    expect(exerciseDay(withDrill, firstOfSecondDay - 1)).toBe('first');
  });
});

describe('withoutSecondDay and restoreSecondDay', () => {
  it('drops the second Day and puts it back on Undo', () => {
    const both = mondayAndWednesday();
    const removed = withoutSecondDay(both);
    expect(removed.draft.secondDay).toBeNull();
    expect(removed.draft.exercises).toHaveLength(both.exercises.length - secondDayCount(both));
    const restored = restoreSecondDay(removed.draft, removed.removed!);
    expect(restored.secondDay).toEqual(both.secondDay);
    expect(restored.exercises.map((exercise) => exercise.clientId)).toEqual(
      both.exercises.map((exercise) => exercise.clientId),
    );
  });

  it('does not restore over a second Day added since', () => {
    const removed = withoutSecondDay(mondayAndWednesday());
    const readded = withSecondDay(removed.draft, WEDNESDAY, catalog, 'another').draft;
    expect(restoreSecondDay(readded, removed.removed!)).toBe(readded);
  });
});

describe('Day boundaries', () => {
  it('never offers a superset across the two Days', () => {
    const both = mondayAndWednesday();
    const lastOfFirstDay = both.exercises.findIndex((_, index) => exerciseDay(both, index) === 'second') - 1;
    expect(exerciseMenuChoices(both, lastOfFirstDay)).not.toContain('superset_with_next');
  });

  it('keeps the second Day when its first exercise is removed', () => {
    const both = mondayAndWednesday();
    const firstOfSecondDay = both.exercises.findIndex((_, index) => exerciseDay(both, index) === 'second');
    const fewer = removeExercise(both, firstOfSecondDay);
    expect(secondDayCount(fewer)).toBe(secondDayCount(both) - 1);
    expect(fewer.secondDay).toEqual(both.secondDay);
  });
});

describe('draftTitle', () => {
  it('names both Days under one program name', () => {
    expect(draftTitle(monday())).toBe('Madcow 5x5 — W1 Day 1');
    expect(draftTitle(mondayAndWednesday())).toBe('Madcow 5x5 — W1 Day 1 + W1 Day 2');
  });
});

describe('completeSessionPayload with a second Day', () => {
  it('lists the done sets of the second Day for its own Session', () => {
    let both = mondayAndWednesday();
    const first = both.exercises[0];
    const firstOfSecondDay = both.exercises.findIndex((_, index) => exerciseDay(both, index) === 'second');
    const second = both.exercises[firstOfSecondDay];
    both = toggleSetDone(both, 0, first.sets[0].id);
    both = toggleSetDone(both, firstOfSecondDay, second.sets[0].id);
    const payload = completeSessionPayload(both);
    expect(payload.sets.map((set) => set.id)).toEqual([first.sets[0].id, second.sets[0].id]);
    expect(payload.secondDay).toEqual({
      id: SECOND_SESSION_ID,
      program: { enrollmentId: enrollment.id, position: weekDay(1, 'wed') },
      setIds: [second.sets[0].id],
    });
  });

  it('sends no second Day for a one-Day Draft', () => {
    expect(completeSessionPayload(monday()).secondDay).toBeNull();
  });
});

describe('stored second Day', () => {
  it('survives a round trip through storage', () => {
    const both = mondayAndWednesday();
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 1, draft: both }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.secondDay).toEqual(both.secondDay);
    expect(parsed?.kind === 'draft' && secondDayCount(parsed.draft)).toBe(secondDayCount(both));
  });

  it('drops a malformed second Day and keeps its exercises in the first Day', () => {
    const both = mondayAndWednesday();
    const parsed = parseStoredDraft(
      { v: 5, kind: 'draft', userId, updatedAt: 1, draft: { ...both, secondDay: { sessionId: 1 } } },
      userId,
    );
    expect(parsed?.kind === 'draft' && parsed.draft.secondDay).toBeUndefined();
    expect(parsed?.kind === 'draft' && secondDayCount(parsed.draft)).toBe(0);
  });
});

describe('dayDrafts', () => {
  it('gives each synced Day its own Draft and sync result, so each becomes its own Program fact', () => {
    const both = mondayAndWednesday();
    const days = dayDrafts(both, {
      kind: 'synced',
      summary: {
        programLinked: true,
        completedAt: 'first-at',
        days: [
          { sessionId: both.sessionId, programLinked: true, completedAt: 'first-at' },
          { sessionId: SECOND_SESSION_ID, programLinked: false, completedAt: 'second-at' },
        ],
      },
    });
    expect(days.map(({ draft, outcome }) => [draft.sessionId, draft.program?.position, outcome.summary])).toEqual([
      [both.sessionId, weekDay(1, 'mon'), { programLinked: true, completedAt: 'first-at' }],
      [SECOND_SESSION_ID, weekDay(1, 'wed'), { programLinked: false, completedAt: 'second-at' }],
    ]);
    expect(days[0].draft.exercises.every((exercise) => !exercise.inSecondDay)).toBe(true);
    expect(days[1].draft.exercises.every((exercise) => exercise.inSecondDay)).toBe(true);
  });

  it('keeps a one-Day Draft as it is', () => {
    const draft = monday();
    const outcome = { kind: 'synced' as const, summary: { programLinked: true, completedAt: 'at' } };
    expect(dayDrafts(draft, outcome)).toEqual([{ draft, outcome }]);
  });

  it('leaves out a Day the server did not store', () => {
    const both = mondayAndWednesday();
    const days = dayDrafts(both, {
      kind: 'synced',
      summary: {
        programLinked: true,
        completedAt: 'at',
        days: [{ sessionId: SECOND_SESSION_ID, programLinked: true, completedAt: 'at' }],
      },
    });
    expect(days.map(({ draft }) => draft.sessionId)).toEqual([SECOND_SESSION_ID]);
  });
});

describe('dayNameOf', () => {
  it('takes the Day part of a program label', () => {
    expect(dayNameOf('Madcow 5x5 — W1 Day 2')).toBe('W1 Day 2');
    expect(dayNameOf('Push day')).toBe('Push day');
  });
});

describe('labelledDays', () => {
  it('names each synced Session after its Day', () => {
    const both = mondayAndWednesday();
    const synced = [
      { sessionId: both.sessionId, programLinked: true, completedAt: 'a' },
      { sessionId: SECOND_SESSION_ID, programLinked: true, completedAt: 'b' },
    ];
    expect(labelledDays(both, synced).map((day) => [day.sessionId, day.label])).toEqual([
      [both.sessionId, 'W1 Day 1'],
      [SECOND_SESSION_ID, 'W1 Day 2'],
    ]);
  });
});

describe('supersets across Days', () => {
  it('drops a stored superset that spans both Days', () => {
    const both = mondayAndWednesday();
    const boundary = both.exercises.findIndex((_, index) => exerciseDay(both, index) === 'second');
    const exercises = both.exercises.map((exercise, index) =>
      index === boundary - 1 || index === boundary ? { ...exercise, supersetId: 'across' } : exercise,
    );
    const parsed = parseStoredDraft(
      { v: 5, kind: 'draft', userId, updatedAt: 1, draft: { ...both, exercises } },
      userId,
    );
    const kept = parsed?.kind === 'draft' ? parsed.draft.exercises : [];
    expect(kept.filter((exercise) => exercise.modality === 'lift' && exercise.supersetId === 'across')).toEqual([]);
  });
});
