import { describe, expect, it } from 'vitest';
import { nextUpdatedAt, parseStoredDraft, type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';

const userId = '11111111-1111-4111-8111-111111111111';

function workout(overrides: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    sessionId: '22222222-2222-4222-8222-222222222222',
    startedAt: '2026-09-30T10:00:00.000Z',
    finishedAt: '2026-09-30T11:00:00.000Z',
    programDayId: null,
    programLabel: null,
    exercises: [
      {
        exerciseId: 'bench',
        name: 'Bench',
        loadType: 'external',
        target: null,
        sets: [
          { id: 'set-a', weightKg: 60, reps: 8, effortLevel: 'hard', done: true },
          { id: 'set-b', weightKg: 60, reps: 8, effortLevel: null, done: false },
        ],
      },
      {
        exerciseId: 'row',
        name: 'Row',
        loadType: 'external',
        target: { sets: 3, repsMin: 8, repsMax: 12 },
        sets: [
          { id: 'set-c', weightKg: 50, reps: 10, effortLevel: null, done: false },
          { id: 'set-d', weightKg: 50, reps: 10, effortLevel: 'easy', done: true },
          { id: 'set-e', weightKg: 55, reps: 9, effortLevel: null, done: true },
        ],
      },
    ],
    ...overrides,
  };
}

describe('parseStoredDraft', () => {
  it('accepts a v2 draft for the same user', () => {
    const raw = { v: 2, kind: 'draft', userId, updatedAt: 5, draft: workout() };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it('accepts a v2 tombstone for the same user', () => {
    const raw = { v: 2, kind: 'synced', userId, updatedAt: 6, syncedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it('rejects a record that belongs to another user', () => {
    const raw = { v: 2, kind: 'draft', userId: 'someone-else', updatedAt: 5, draft: workout() };
    expect(parseStoredDraft(raw, userId)).toBeNull();
  });

  it('rejects a v1 draft', () => {
    expect(parseStoredDraft({ v: 1, userId, draft: workout() }, userId)).toBeNull();
  });

  it.each([null, undefined, 'garbage', 42, [], {}, { v: 2, kind: 'draft', userId, updatedAt: 'soon', draft: {} }])(
    'rejects garbage %j',
    (raw) => {
      expect(parseStoredDraft(raw, userId)).toBeNull();
    },
  );
});

describe('nextUpdatedAt', () => {
  it('uses the clock when it is ahead of the last seen timestamp', () => {
    expect(nextUpdatedAt(100, 250)).toBe(250);
  });

  it('stays monotonic when the clock goes backwards', () => {
    expect(nextUpdatedAt(1_000, 400)).toBe(1_001);
    expect(nextUpdatedAt(1_001, 1_001)).toBe(1_002);
  });
});

describe('completeSessionPayload', () => {
  it('sends only done sets, numbered 0..n-1', () => {
    const payload = completeSessionPayload(workout());
    expect(payload.sets.map((set) => [set.id, set.position])).toEqual([
      ['set-a', 0],
      ['set-d', 1],
      ['set-e', 2],
    ]);
    expect(payload.sets[0]).toMatchObject({ exerciseId: 'bench', effort: { type: 'level', level: 'hard' } });
    expect(payload.sets[2]).toMatchObject({ exerciseId: 'row', weightKg: 55, reps: 9, effort: null });
  });

  it('sends a null programDayId for a freestyle workout', () => {
    expect(completeSessionPayload(workout()).programDayId).toBeNull();
  });

  it('sends the programDayId of a program workout', () => {
    const programDayId = '33333333-3333-4333-8333-333333333333';
    expect(completeSessionPayload(workout({ programDayId })).programDayId).toBe(programDayId);
  });
});
