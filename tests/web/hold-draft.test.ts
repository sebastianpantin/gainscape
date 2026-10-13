import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, MAX_SETS_PER_SESSION } from '@domain/index.ts';
import { previewSession } from '../../web/src/features/workout/xp-preview.ts';
import { toExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  addHoldExercise,
  addSet,
  draftRecord,
  type HoldDraftExercise,
  parseStoredDraft,
  startDraft,
  toggleSetDone,
  type WorkoutDraft,
} from '../../web/src/offline/draft-format.ts';
import { removeSet, updateHoldSet } from '../../web/src/lib/workout/exercise-edit-rules.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';

const userId = 'user-1';

function withCarry(): WorkoutDraft {
  return addSet(addHoldExercise(startDraft(), 'carry', 'Farmers Carry', 'external', 'distance'), 0);
}

function holdOf(draft: WorkoutDraft): HoldDraftExercise {
  const exercise = draft.exercises[0];
  if (exercise.modality !== 'hold') throw new Error('expected a hold exercise');
  return exercise;
}

describe('hold drafts', () => {
  it('adds a carry with a first done set of 20 kg over 20 m and a hang with 0 kg for 30 s', () => {
    const carry = holdOf(withCarry());
    expect(carry).toMatchObject({ modality: 'hold', measure: 'distance', loadType: 'external' });
    expect(carry.sets).toEqual([
      { id: expect.any(String), kind: 'hold', weightKg: 20, durationS: null, distanceM: 20, effort: null, done: true },
    ]);
    const hang = holdOf(addSet(addHoldExercise(startDraft(), 'hang', 'Dead Hang', 'bodyweight', 'time'), 0));
    expect(hang.sets[0]).toMatchObject({ weightKg: 0, durationS: 30, distanceM: null });
  });

  it('copies the previous set into the next one and edits a set by id', () => {
    const draft = withCarry();
    const [first] = holdOf(draft).sets;
    const edited = updateHoldSet(draft, 0, first.id, {
      weightKg: 32,
      distanceM: 40,
      effort: { type: 'level', level: 'hard' },
    });
    const twice = addSet(edited, 0);
    expect(holdOf(twice).sets.map(({ weightKg, distanceM, effort }) => ({ weightKg, distanceM, effort }))).toEqual([
      { weightKg: 32, distanceM: 40, effort: { type: 'level', level: 'hard' } },
      { weightKg: 32, distanceM: 40, effort: null },
    ]);
    const second = holdOf(twice).sets[1];
    expect(holdOf(toggleSetDone(twice, 0, second.id)).sets[1].done).toBe(false);
    expect(holdOf(removeSet(twice, 0, first.id)).sets.map((set) => set.id)).toEqual([second.id]);
  });

  it('adds no hold set once the workout holds the most sets the server takes', () => {
    const carry = holdOf(withCarry());
    const full: WorkoutDraft = {
      ...withCarry(),
      exercises: [{ ...carry, sets: Array.from({ length: MAX_SETS_PER_SESSION }, () => carry.sets[0]) }],
    };
    expect(addSet(full, 0)).toBe(full);
  });

  it('writes a draft with a hold as format 6, keeps other drafts at format 5 and reads both', () => {
    const record = draftRecord(userId, 7, withCarry());
    expect(record.v).toBe(6);
    expect(parseStoredDraft(JSON.parse(JSON.stringify(record)), userId)).toEqual(record);
    const plain = draftRecord(userId, 7, startDraft());
    expect(plain.v).toBe(5);
    expect(parseStoredDraft(JSON.parse(JSON.stringify(plain)), userId)).toEqual(plain);
    expect(parseStoredDraft({ ...plain, v: 6 }, userId)).toEqual(plain);
  });

  it('drops an effort that is not a level from a stored hold set', () => {
    const draft = withCarry();
    const [set] = holdOf(draft).sets;
    const broken = updateHoldSet(draft, 0, set.id, { effort: { type: 'rir', value: 2 } });
    const parsed = parseStoredDraft(JSON.parse(JSON.stringify(draftRecord(userId, 7, broken))), userId);
    expect(parsed?.kind === 'draft' && holdOf(parsed.draft).sets[0].effort).toBeNull();
  });

  it('sends a done hold as a hold set', () => {
    const draft = withCarry();
    const [set] = holdOf(draft).sets;
    expect(completeSessionPayload(draft).sets).toEqual([
      {
        kind: 'hold',
        id: set.id,
        exerciseId: 'carry',
        position: 0,
        weightKg: 20,
        durationS: null,
        distanceM: 20,
        effort: null,
      },
    ]);
  });

  it('previews a hold the way the server pays it', () => {
    const draft = withCarry();
    const [set] = holdOf(draft).sets;
    const failed = updateHoldSet(draft, 0, set.id, { distanceM: 50, effort: { type: 'level', level: 'failure' } });
    const [[preview]] = previewSession(failed.exercises, () => true, {});
    expect(preview).toMatchObject({ xp: 6 * DEFAULT_BALANCE.xpPerEffectiveRep, basis: 'logged' });
    const unrated = updateHoldSet(draft, 0, set.id, { distanceM: 50 });
    expect(previewSession(unrated.exercises, () => true, {})[0][0].xp).toBe(3 * DEFAULT_BALANCE.xpPerEffectiveRep);
  });
});

describe('hold exercises in the catalog', () => {
  it('maps the measure of a hold exercise and leaves rep lifts without one', () => {
    const base = {
      id: 'carry',
      name: 'Farmers Carry',
      equipment: 'dumbbell',
      modality: 'lift' as const,
      load_type: 'external' as const,
      owner_user_id: null,
      archived_at: null,
      reference_pace_s_per_km: null,
      pace_unit: null,
      max_effort: null,
      tracks_distance: true,
      exercise_skills: [],
    };
    expect(toExercise({ ...base, measure: 'distance' })).toMatchObject({ modality: 'lift', measure: 'distance' });
    expect(toExercise({ ...base, measure: 'reps' })).not.toHaveProperty('measure');
  });
});
