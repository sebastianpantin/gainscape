import { describe, expect, it } from 'vitest';
import {
  type Exercise,
  exerciseLabels,
  type ExerciseRow,
  isCardioExercise,
  isCompoundLift,
  isLiftExercise,
  toExercise,
} from '../../web/src/lib/catalog-rules.ts';

function row(overrides: Partial<ExerciseRow>): ExerciseRow {
  return {
    id: 'bench',
    name: 'Barbell Bench Press',
    equipment: 'barbell',
    modality: 'lift',
    load_type: 'external',
    owner_user_id: null,
    archived_at: null,
    reference_pace_s_per_km: null,
    pace_unit: null,
    max_effort: null,
    exercise_skills: [],
    ...overrides,
  };
}

describe('toExercise', () => {
  it('maps a built-in lift with its load type', () => {
    expect(toExercise(row({ load_type: 'bodyweight_plus' }))).toEqual({
      id: 'bench',
      name: 'Barbell Bench Press',
      equipment: 'barbell',
      custom: false,
      archived: false,
      modality: 'lift',
      loadType: 'bodyweight_plus',
      compound: false,
    });
  });

  it('marks a lift as compound from its skill shares', () => {
    const shares = (...bp: number[]) => bp.map((share_bp) => ({ share_bp, skills: { key: 'chest' } }));
    expect(toExercise(row({ exercise_skills: shares(7000, 2000, 1000) }))).toMatchObject({ compound: true });
    expect(toExercise(row({ exercise_skills: shares(10_000) }))).toMatchObject({ compound: false });
  });

  it('marks owned exercises as custom and archived ones as archived, defaulting the load type to external', () => {
    expect(
      toExercise(row({ owner_user_id: 'user-1', archived_at: '2026-09-30T00:00:00Z', load_type: null })),
    ).toMatchObject({ custom: true, archived: true, loadType: 'external' });
  });

  it('maps a cardio activity with its skill shares, skipping shares without a skill', () => {
    expect(
      toExercise(
        row({
          id: 'run',
          name: 'Run',
          equipment: 'other',
          modality: 'cardio',
          load_type: null,
          reference_pace_s_per_km: 330,
          pace_unit: 'per_km',
          max_effort: 'hard',
          exercise_skills: [
            { share_bp: 7000, skills: { key: 'legs' } },
            { share_bp: 3000, skills: null },
          ],
        }),
      ),
    ).toEqual({
      id: 'run',
      name: 'Run',
      equipment: 'other',
      custom: false,
      archived: false,
      modality: 'cardio',
      activity: {
        paceUnit: 'per_km',
        referencePaceSPerKm: 330,
        maxEffort: 'hard',
        shares: [{ skillKey: 'legs', shareBasisPoints: 7000 }],
      },
    });
  });

  it('defaults a cardio activity to per-km pace and a max effort ceiling', () => {
    const exercise = toExercise(row({ modality: 'cardio', load_type: null }));
    expect(exercise).toMatchObject({ activity: { paceUnit: 'per_km', maxEffort: 'max', referencePaceSPerKm: null } });
  });
});

describe('isCompoundLift', () => {
  it('counts a lift spread over several skills as compound', () => {
    expect(isCompoundLift('dumbbell', [7000, 2000, 1000])).toBe(true);
    expect(isCompoundLift('cable', [7500, 2500])).toBe(true);
    expect(isCompoundLift('bodyweight', [5000, 3500, 1500])).toBe(true);
  });

  it('counts a barbell lift that is mostly one skill as compound', () => {
    expect(isCompoundLift('barbell', [9000, 1000])).toBe(true);
    expect(isCompoundLift('barbell', [8500, 1500])).toBe(true);
  });

  it('counts a lift that is mostly or only one skill as isolation', () => {
    expect(isCompoundLift('cable', [9000, 1000])).toBe(false);
    expect(isCompoundLift('machine', [10_000])).toBe(false);
    expect(isCompoundLift('barbell', [10_000])).toBe(false);
    expect(isCompoundLift('dumbbell', [8000, 2000])).toBe(false);
  });

  it('counts a lift without shares as isolation', () => {
    expect(isCompoundLift('barbell', [])).toBe(false);
  });
});

describe('exercise guards and labels', () => {
  const lift = toExercise(row({}));
  const cardio = toExercise(row({ id: 'run', modality: 'cardio', load_type: null }));

  it('tells lifts and cardio apart', () => {
    expect([lift, cardio].map(isLiftExercise)).toEqual([true, false]);
    expect([lift, cardio].map(isCardioExercise)).toEqual([false, true]);
  });

  it('labels custom and archived exercises', () => {
    const labelled = (custom: boolean, archived: boolean): Exercise => ({ ...lift, custom, archived });
    expect(exerciseLabels(labelled(false, false))).toBe('');
    expect(exerciseLabels(labelled(true, false))).toBe('(custom)');
    expect(exerciseLabels(labelled(false, true))).toBe('(archived)');
    expect(exerciseLabels(labelled(true, true))).toBe('(custom) (archived)');
  });
});
