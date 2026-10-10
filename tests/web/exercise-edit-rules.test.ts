import { describe, expect, it } from 'vitest';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import {
  canAddSet,
  defaultWeightKg,
  nextBoutValues,
  nextSetValues,
  removeSet,
  roomForSets,
  setCount,
  updateBout,
  updateSet,
  withLoadType,
} from '../../web/src/lib/exercise-edit-rules.ts';
import type { SessionEdit } from '../../web/src/features/history/session-edit.ts';
import type { WorkoutDraft } from '../../web/src/offline/draft-format.ts';

const bout = { id: 'bout-1', kind: 'cardio' as const, durationS: 600, distanceM: 2000, interval: null, effort: null };

function draft(): WorkoutDraft {
  return {
    sessionId: 'session',
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: null,
    programDayId: null,
    programLabel: null,
    exercises: [
      {
        clientId: 'card-bench',
        exerciseId: 'bench',
        name: 'Bench',
        modality: 'lift',
        loadType: 'external',
        target: null,
        sets: [{ id: 'set-1', weightKg: 60, reps: 8, effort: null, done: false, isWarmup: false }],
      },
      {
        clientId: 'card-run',
        exerciseId: 'run',
        name: 'Run',
        modality: 'cardio',
        activity: { paceUnit: 'per_km', referencePaceSPerKm: 360, maxEffort: 'max', shares: [] },
        sets: [{ ...bout, done: true }],
      },
    ],
  };
}

function edit(): SessionEdit {
  return {
    sessionId: 'session',
    revision: 1,
    notes: '',
    exercises: [
      {
        exerciseId: 'bench',
        name: 'Bench',
        modality: 'lift',
        loadType: 'external',
        sets: [{ id: 'set-1', weightKg: 60, reps: 8, isWarmup: false, effort: null }],
      },
      { exerciseId: 'run', name: 'Run', modality: 'cardio', paceUnit: 'per_km', sets: [bout] },
    ],
  };
}

describe('exercise edit rules', () => {
  it('update a lift set or a bout the same way in a live draft and in a history edit', () => {
    expect(updateSet(draft(), 0, 'set-1', { reps: 5 }).exercises[0].sets[0]).toMatchObject({ reps: 5, weightKg: 60 });
    expect(updateSet(edit(), 0, 'set-1', { reps: 5 }).exercises[0].sets[0]).toMatchObject({ reps: 5, weightKg: 60 });
    expect(updateBout(draft(), 1, 'bout-1', { durationS: 900 }).exercises[1].sets[0]).toMatchObject({ durationS: 900 });
    expect(updateBout(edit(), 1, 'bout-1', { durationS: 900 }).exercises[1].sets[0]).toMatchObject({ durationS: 900 });
  });

  it('leave an exercise of the other kind alone', () => {
    expect(updateSet(draft(), 1, 'bout-1', { reps: 5 })).toEqual(draft());
    expect(updateBout(edit(), 0, 'set-1', { durationS: 900 })).toEqual(edit());
  });

  it('remove one set and keep the exercise', () => {
    expect(removeSet(edit(), 0, 'set-1').exercises.map((exercise) => exercise.sets.length)).toEqual([0, 1]);
  });

  it('count sets of every exercise against the server limit', () => {
    expect(setCount(draft())).toBe(2);
    expect(roomForSets(edit())).toBe(MAX_SETS_PER_SESSION - 2);
    expect(canAddSet({ exercises: [{ sets: Array.from({ length: MAX_SETS_PER_SESSION }) }] })).toBe(false);
  });

  it('zero every load once an exercise becomes bodyweight and keep loads otherwise', () => {
    const lift = edit().exercises[0];
    if (lift.modality !== 'lift') throw new Error('expected a lift');
    expect(withLoadType(lift, 'bodyweight')).toMatchObject({ loadType: 'bodyweight', sets: [{ weightKg: 0 }] });
    expect(withLoadType(lift, 'bodyweight_plus')).toMatchObject({
      loadType: 'bodyweight_plus',
      sets: [{ weightKg: 60 }],
    });
  });

  it('start a new set from the previous one or from the defaults', () => {
    expect(nextSetValues({ weightKg: 70, reps: 6 }, 'external')).toEqual({ weightKg: 70, reps: 6 });
    expect(nextSetValues(undefined, 'external')).toEqual({ weightKg: defaultWeightKg('external'), reps: 8 });
    expect(defaultWeightKg('bodyweight_plus')).toBe(0);
    expect(nextBoutValues(undefined)).toEqual({ durationS: 1800, distanceM: null, interval: null, effort: null });
    expect(nextBoutValues(bout)).toEqual({ durationS: 600, distanceM: 2000, interval: null, effort: null });
  });
});
