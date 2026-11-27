import { describe, expect, it } from 'vitest';
import type { LiftDraftExercise, WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import { boutPayload, completeSessionPayload } from '../../web/src/offline/session-payload.ts';

const easy = { type: 'cardio', level: 'easy' } as const;

describe('boutPayload', () => {
  it('sends a steady bout with its duration', () => {
    expect(
      boutPayload({ id: 'bout-a', durationS: 1800, distanceM: 5000, interval: null, effort: easy }, 'run', 3),
    ).toEqual({
      kind: 'cardio',
      id: 'bout-a',
      exerciseId: 'run',
      position: 3,
      durationS: 1800,
      distanceM: 5000,
      interval: null,
      effort: easy,
      pain: null,
    });
  });

  it('leaves the duration out of an interval bout', () => {
    const interval = { workS: 30, restS: 30, rounds: 10 };
    expect(boutPayload({ id: 'bout-b', durationS: 999, distanceM: null, interval, effort: null }, 'row', 0)).toEqual({
      kind: 'cardio',
      id: 'bout-b',
      exerciseId: 'row',
      position: 0,
      distanceM: null,
      interval,
      effort: null,
      pain: null,
    });
  });

  it('sends the pain logged on a bout', () => {
    const bout = { id: 'bout-c', durationS: 600, distanceM: null, interval: null, effort: null, pain: 4 };
    expect(boutPayload(bout, 'run', 0).pain).toBe(4);
  });
});

describe('pain in the finished workout', () => {
  it('sends the pain of each done lift and hold set, and null where none was logged', () => {
    const draft: WorkoutDraft = {
      sessionId: 's',
      startedAt: '2026-09-30T10:00:00.000Z',
      finishedAt: '2026-09-30T11:00:00.000Z',
      programDayId: null,
      programLabel: null,
      program: null,
      exercises: [
        {
          clientId: 'curl',
          exerciseId: 'curl',
          name: 'Eccentric Wrist Curl',
          modality: 'lift',
          loadType: 'external',
          target: null,
          sets: [
            { id: 'a', weightKg: 6, reps: 15, effort: null, done: true, isWarmup: false, pain: 3 },
            { id: 'b', weightKg: 6, reps: 15, effort: null, done: true, isWarmup: false },
          ],
        },
        {
          clientId: 'hold',
          exerciseId: 'hold',
          name: 'Isometric Wrist Flexion',
          modality: 'hold',
          measure: 'time',
          loadType: 'external',
          sets: [
            { id: 'c', kind: 'hold', weightKg: 4, durationS: 45, distanceM: null, effort: null, done: true, pain: 2 },
          ],
        },
      ],
    };
    expect(completeSessionPayload(draft).sets.map((set) => [set.id, set.pain])).toEqual([
      ['a', 3],
      ['b', null],
      ['c', 2],
    ]);
  });
});

describe('completeSessionPayload with a challenge', () => {
  const draft: WorkoutDraft = {
    sessionId: 's',
    startedAt: '2026-09-30T10:00:00.000Z',
    finishedAt: '2026-09-30T11:00:00.000Z',
    programDayId: null,
    programLabel: 'Challenge — Ten-Ton Day',
    program: null,
    exercises: [],
  };

  it('sends only the challenge id of a challenge workout', () => {
    const challenge = {
      challengeId: 'challenge-tt',
      name: 'Ten-Ton Day',
      definition: { kind: 'volume' as const, metric: 'kg' as const, target: 10000, exerciseId: null, minPct: null },
      targetLoadsKg: {},
    };
    expect(completeSessionPayload({ ...draft, challenge }).challenge).toEqual({ challengeId: 'challenge-tt' });
  });

  it('sends a null challenge for a normal workout, also from an older draft', () => {
    expect(completeSessionPayload(draft).challenge).toBeNull();
    expect(completeSessionPayload({ ...draft, challenge: null }).challenge).toBeNull();
  });
});

describe('completeSessionPayload with supersets', () => {
  function lift(exerciseId: string, setIds: string[], supersetId: string | null): LiftDraftExercise {
    return {
      clientId: `card-${exerciseId}`,
      exerciseId,
      name: exerciseId,
      modality: 'lift',
      loadType: 'external',
      target: null,
      supersetId,
      sets: setIds.map((id) => ({
        id,
        weightKg: 60,
        reps: 8,
        effort: null,
        done: true,
        isWarmup: false,
        prescription: null,
      })),
    };
  }

  function draftOf(supersetId: string | null): WorkoutDraft {
    return {
      sessionId: 's',
      startedAt: '2026-09-30T10:00:00.000Z',
      finishedAt: '2026-09-30T11:00:00.000Z',
      programDayId: null,
      programLabel: null,
      program: null,
      exercises: [lift('bench', ['a1', 'a2'], supersetId), lift('row', ['b1', 'b2'], supersetId)],
    };
  }

  it('sends the same payload for a grouped workout as for the ungrouped one', () => {
    expect(completeSessionPayload(draftOf('g'))).toEqual(completeSessionPayload(draftOf(null)));
  });

  it('keeps the sets exercise by exercise, not round by round', () => {
    expect(completeSessionPayload(draftOf('g')).sets.map((set) => set.id)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });
});
