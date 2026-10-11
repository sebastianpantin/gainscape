import { describe, expect, it } from 'vitest';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import {
  addableExercises,
  canAddSet,
  canAddSetTo,
  defaultWeightKg,
  nextBoutValues,
  nextHoldValues,
  nextSetValues,
  removeSet,
  roomForSets,
  setCount,
  updateBout,
  updateHoldSet,
  updateSet,
  withLoadType,
} from '../../web/src/lib/exercise-edit-rules.ts';
import type { SessionEdit } from '../../web/src/features/history/session-edit.ts';
import type { WorkoutDraft } from '../../web/src/offline/draft-format.ts';

const bout = { id: 'bout-1', kind: 'cardio' as const, durationS: 600, distanceM: 2000, interval: null, effort: null };
const hold = { id: 'hold-1', kind: 'hold' as const, weightKg: 24, durationS: 30, distanceM: null, effort: null };
const holdExercise = {
  exerciseId: 'hang',
  name: 'Dead Hang',
  modality: 'hold' as const,
  measure: 'time' as const,
  loadType: 'bodyweight_plus' as const,
};

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
        activity: { paceUnit: 'per_km', referencePaceSPerKm: 360, maxEffort: 'max', tracksDistance: true, shares: [] },
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
      { exerciseId: 'run', name: 'Run', modality: 'cardio', paceUnit: 'per_km', tracksDistance: true, sets: [bout] },
    ],
  };
}

function draftWithHold(): WorkoutDraft {
  const base = draft();
  return {
    ...base,
    exercises: [...base.exercises, { ...holdExercise, clientId: 'card-hang', sets: [{ ...hold, done: true }] }],
  };
}

function editWithHold(): SessionEdit {
  const base = edit();
  return { ...base, exercises: [...base.exercises, { ...holdExercise, sets: [hold] }] };
}

describe('exercise edit rules', () => {
  it('update a hold the same way in a live draft and in a history edit', () => {
    expect(updateHoldSet(draftWithHold(), 2, 'hold-1', { durationS: 45 }).exercises[2].sets[0]).toMatchObject({
      durationS: 45,
      weightKg: 24,
    });
    expect(updateHoldSet(editWithHold(), 2, 'hold-1', { durationS: 45 }).exercises[2].sets[0]).toMatchObject({
      durationS: 45,
      weightKg: 24,
    });
    expect(updateHoldSet(editWithHold(), 0, 'set-1', { durationS: 45 })).toEqual(editWithHold());
    expect(setCount(draftWithHold())).toBe(3);
  });

  it('start a new hold from the previous one, unrated, or from the defaults of its measure', () => {
    expect(nextHoldValues({ ...hold, effort: { type: 'level', level: 'hard' } }, 'external', 'time')).toEqual({
      weightKg: 24,
      durationS: 30,
      distanceM: null,
      effort: null,
    });
    expect(nextHoldValues(undefined, 'external', 'distance')).toEqual({
      weightKg: defaultWeightKg('external'),
      durationS: null,
      distanceM: 20,
      effort: null,
    });
    expect(nextHoldValues(undefined, 'bodyweight', 'time')).toMatchObject({ weightKg: 0, durationS: 30 });
  });

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

  it('add a bout only while the bouts of the workout stay under 4 hours, and other sets regardless', () => {
    const fourHours = updateBout(edit(), 1, 'bout-1', { durationS: 14_400 });
    expect(canAddSetTo(edit(), 'cardio')).toBe(true);
    expect(canAddSetTo(fourHours, 'cardio')).toBe(false);
    expect(canAddSetTo(fourHours, 'lift')).toBe(true);
    expect(canAddSetTo(updateBout(draft(), 1, 'bout-1', { durationS: 14_400 }), 'hold')).toBe(true);
  });

  it('offer only the exercises a set or bout can still be added to', () => {
    const running = { id: 'run', modality: 'cardio' as const };
    const bench = { id: 'bench', modality: 'lift' as const };
    const fourHours = updateBout(edit(), 1, 'bout-1', { durationS: 14_400 });
    expect(addableExercises(edit(), [running, bench])).toEqual([running, bench]);
    expect(addableExercises(fourHours, [running, bench])).toEqual([bench]);
  });

  it('add nothing of any kind once the workout holds the most sets the server accepts', () => {
    const full = { exercises: [{ modality: 'lift' as const, sets: Array.from({ length: MAX_SETS_PER_SESSION }) }] };
    expect(canAddSetTo(full, 'lift')).toBe(false);
    expect(canAddSetTo(full, 'cardio')).toBe(false);
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
